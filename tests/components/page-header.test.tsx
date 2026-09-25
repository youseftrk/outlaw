// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "./setup";

import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_CLASS } from "@/lib/format";

describe("PageHeader", () => {
  it("renders eyebrow, display title, description and actions", () => {
    render(
      <PageHeader
        eyebrow="Governance"
        title="Trust, but verify"
        description="Policies, approvals and traces."
        actions={<button type="button">Export</button>}
      />,
    );
    expect(screen.getByText("Governance")).toHaveProperty("className", expect.stringContaining("eyebrow"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveProperty("textContent", "Trust, but verify");
    expect(screen.getByText("Policies, approvals and traces.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("omits optional parts when not provided", () => {
    const { container } = render(<PageHeader title="Fleet" />);
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1 })).toHaveProperty("textContent", "Fleet");
  });
});

describe("severity Badge", () => {
  it("uses the shared sev-* token class for every severity", () => {
    render(
      <>
        {(Object.keys(SEVERITY_CLASS) as (keyof typeof SEVERITY_CLASS)[]).map((sev) => (
          <Badge key={sev} variant="outline" className={`mono-data ${SEVERITY_CLASS[sev]}`}>
            {sev}
          </Badge>
        ))}
      </>,
    );
    for (const sev of ["info", "low", "medium", "high", "critical"] as const) {
      const el = screen.getByText(sev);
      expect(el.getAttribute("data-slot")).toBe("badge");
      expect(el.className).toContain(`sev-${sev}`);
    }
  });
});
