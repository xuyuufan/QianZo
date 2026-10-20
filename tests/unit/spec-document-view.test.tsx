import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpecDocumentView } from "@/components/spec-document-view";
import type { SpecDocumentV1 } from "@/modules/specs/document";

import { validSpecDocument } from "../helpers/spec-fixture";

describe("SpecDocumentView", () => {
  it("masks missing-reference fallbacks only in the public view", () => {
    const document: SpecDocumentV1 = structuredClone(validSpecDocument());
    const missingRoleId = "ZZSECRET-MISSING-ROLE";
    const missingFeatureId = "ZZSECRET-MISSING-FEATURE";
    const missingDeliverableId = "ZZSECRET-MISSING-DELIVERABLE";
    document.features[0].userRoleIds = [missingRoleId];
    document.pages[0].featureIds = [missingFeatureId];
    document.milestones[0].deliverableIds = [missingDeliverableId];

    const publicMarkup = renderToStaticMarkup(<SpecDocumentView document={document} showIds={false} />);
    const privateMarkup = renderToStaticMarkup(<SpecDocumentView document={document} showIds />);

    expect(publicMarkup).not.toContain(missingRoleId);
    expect(publicMarkup).not.toContain(missingFeatureId);
    expect(publicMarkup).not.toContain(missingDeliverableId);
    expect(privateMarkup).toContain(missingRoleId);
    expect(privateMarkup).toContain(missingFeatureId);
    expect(privateMarkup).toContain(missingDeliverableId);
  });
});
