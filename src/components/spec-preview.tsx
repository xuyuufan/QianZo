"use client";

import { specDeliveryDays, type SpecDocumentV1 } from "@/modules/specs/document";

/**
 * Read-only structured preview of a SpecDocumentV1. The same shape serves the
 * private review of a candidate and, once locked, the recruitment view, so no
 * data is hidden by the markup.
 */
export function SpecPreview({ document }: { document: SpecDocumentV1 }) {
  const roleNames = new Map(document.userRoles.map((role) => [role.id, role.name]));
  const featureTitles = new Map(document.features.map((feature) => [feature.id, feature.title]));
  const deliverableTitles = new Map(
    document.deliverables.map((deliverable) => [deliverable.id, deliverable.title]),
  );

  return (
    <div className="spec-preview">
      <section className="spec-section">
        <h3>项目目标</h3>
        <p>{document.projectGoal}</p>
        {document.background ? <p className="spec-muted">{document.background}</p> : null}
        <p className="spec-muted">
          预计周期：{specDeliveryDays(document)} 个自然日（最后一个里程碑的累计自然日）
        </p>
      </section>

      <section className="spec-section">
        <h3>使用者角色</h3>
        <ul>
          {document.userRoles.map((role) => (
            <li key={role.id}>
              <strong>{role.name}</strong> — {role.description}
            </li>
          ))}
        </ul>
      </section>

      <section className="spec-section">
        <h3>功能范围</h3>
        <ul>
          {document.features.map((feature) => (
            <li key={feature.id}>
              <strong>{feature.title}</strong> — {feature.description}
              <span className="spec-muted">
                （涉及角色：
                {feature.userRoleIds.map((id) => roleNames.get(id) ?? id).join("、") || "未指定"}）
              </span>
            </li>
          ))}
        </ul>
      </section>

      {document.pages.length > 0 || document.userFlows.length > 0 ? (
        <section className="spec-section">
          <h3>页面与流程</h3>
          <ul>
            {document.pages.map((page) => (
              <li key={page.id}>
                <strong>{page.name}</strong> — {page.purpose}
                <span className="spec-muted">
                  （关联功能：{page.featureIds.map((id) => featureTitles.get(id) ?? id).join("、") || "未指定"}）
                </span>
              </li>
            ))}
          </ul>
          {document.userFlows.map((flow) => (
            <div key={flow.id}>
              <p>
                <strong>{flow.name}</strong>
              </p>
              <ol>
                {flow.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}

      {document.technicalConstraints.length > 0 || document.integrations.length > 0 ? (
        <section className="spec-section">
          <h3>技术要求</h3>
          <ul>
            {document.integrations.map((integration) => (
              <li key={integration.id}>
                <strong>{integration.name}</strong> — {integration.purpose}（约束：{integration.constraints}）
              </li>
            ))}
            {document.technicalConstraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="spec-section">
        <h3>交付物</h3>
        <ul>
          {document.deliverables.map((deliverable) => (
            <li key={deliverable.id}>
              <strong>{deliverable.title}</strong> — {deliverable.description}
            </li>
          ))}
        </ul>
      </section>

      <section className="spec-section">
        <h3>里程碑与验收</h3>
        {document.milestones.map((milestone) => (
          <div key={milestone.id} className="spec-milestone">
            <p>
              <strong>{milestone.title}</strong>
              <span className="spec-muted">（第 {milestone.dueAfterDays} 个自然日）</span>
            </p>
            <p>{milestone.description}</p>
            <p className="spec-muted">
              交付物：{milestone.deliverableIds.map((id) => deliverableTitles.get(id) ?? id).join("、")}
            </p>
            <ul>
              {milestone.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id}>
                  {criterion.description}
                  <span className="spec-muted">（验证方式：{criterion.verificationMethod}）</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {document.outOfScope.length > 0 ? (
        <section className="spec-section">
          <h3>不做的事项</h3>
          <ul>
            {document.outOfScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {document.assumptions.length > 0 ? (
        <section className="spec-section">
          <h3>假设</h3>
          <ul>
            {document.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
