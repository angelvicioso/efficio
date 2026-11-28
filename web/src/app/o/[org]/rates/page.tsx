import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/session";
import { canManageTeam } from "@/lib/auth/permissions";
import { ratesService } from "@/lib/service";
import { DEFAULT_RATES, RATE_KEYS, money, type RateInfo } from "@/lib/domain/rates";
import { ActionForm } from "../../../ActionForm";
import { saveRatesAction } from "../actions";

export const dynamic = "force-dynamic";

const GROUPS: { kind: RateInfo["kind"]; title: string; note: string }[] = [
  { kind: "port", title: "Port Houston charges", note: "From Port Houston’s published Tariff 14 (effective September 1, 2026). Change them only if your terminal bills you differently." },
  { kind: "carrier", title: "Carrier detention", note: "Defaults from Maersk’s published US export tariff. Your contract with each carrier is likely different: put your own free days and rates here." },
  { kind: "yours", title: "Your own estimates", note: "Things only you know." },
];

const fmt = (key: (typeof RATE_KEYS)[number], v: number) => (DEFAULT_RATES[key].unit === "days" ? `${v} days` : money(v));

export default async function RatesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { user, org } = await requireOrgAccess(slug);
  if (org.type === "ocean_carrier") notFound();
  const editable = canManageTeam(user, org);
  const overrides = ratesService().overrides(org.id);

  return (
    <>
      <section className="intro">
        <h1>Rates for money at risk</h1>
        <p className="muted">
          Efficio estimates what at-risk bookings could cost {org.name}: charges already adding up, and what missing a sailing
          would add. These are the rates it uses. Estimates only: your invoices are what count.
        </p>
      </section>
      {(() => {
        const body = GROUPS.map((g) => (
          <section key={g.kind} className="card">
            <h2>{g.title}</h2>
            <p className="muted small">{g.note}</p>
            <table className="compact rates-table">
              <tbody>
                {RATE_KEYS.filter((k) => DEFAULT_RATES[k].kind === g.kind).map((k) => {
                  const info = DEFAULT_RATES[k];
                  const own = overrides[k];
                  return (
                    <tr key={k}>
                      <th scope="row">
                        <label htmlFor={`rate-${k}`}>{info.label}</label>
                        <div className="muted small">
                          {info.unit} · {info.source}
                        </div>
                      </th>
                      <td className="num">
                        <input
                          id={`rate-${k}`}
                          name={k}
                          inputMode="decimal"
                          defaultValue={own ?? ""}
                          placeholder={String(info.value)}
                          disabled={!editable}
                          className="rate-input"
                        />
                        <div className="small muted">{own !== undefined ? `Yours · default ${fmt(k, info.value)}` : "Using default"}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ));
        return editable ? (
          <ActionForm action={saveRatesAction} submitLabel="Save rates" className="stack rates-form">
            <input type="hidden" name="org" value={org.slug} />
            {body}
            <p className="muted small">Leave a box blank to use the default.</p>
          </ActionForm>
        ) : (
          <div className="stack rates-form">
            {body}
            <p className="muted small">Only your company’s admins can change these.</p>
          </div>
        );
      })()}
    </>
  );
}
