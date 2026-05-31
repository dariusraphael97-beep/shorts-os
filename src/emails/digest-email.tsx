import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Heading,
  Text,
  Button,
  Img,
  Hr,
  Link,
} from "@react-email/components";
import type { DigestEmailProps, DigestNiche } from "@/lib/digest/build-email-props";

// Email clients ignore CSS variables — hex values hardcoded from globals.css
// (light palette, the conventional choice for email).
const COLOR = {
  bg: "#f4f4f5",
  card: "#ffffff",
  textPrimary: "#1c1c1e",
  textSecondary: "#6e6e73",
  textTertiary: "#a8a8ad",
  border: "#e5e5e7",
  accent: "#007aff",
  accentFg: "#ffffff",
  amberBg: "#fff7ed",
  amberFg: "#b45309",
  amberBorder: "#fed7aa",
} as const;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://shorts-os.vercel.app";

function thumbUrl(id: string | null): string | null {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function formatViews(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
}

function prettyFormat(format: string): string {
  return format.replace(/_/g, " ");
}

function UnprovenPill() {
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: COLOR.amberBg,
        color: COLOR.amberFg,
        border: `1px solid ${COLOR.amberBorder}`,
        borderRadius: "9999px",
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "2px 8px",
      }}
    >
      unproven
    </span>
  );
}

function HeroCard({ niche }: { niche: DigestNiche }) {
  const thumb = thumbUrl(niche.thumbnailId);
  return (
    <Section
      style={{
        backgroundColor: COLOR.card,
        border: `1px solid ${COLOR.border}`,
        borderRadius: "14px",
        padding: "0",
        overflow: "hidden",
        marginBottom: "20px",
      }}
    >
      {thumb && (
        <Img
          src={thumb}
          alt=""
          width="100%"
          style={{ display: "block", width: "100%", height: "auto", objectFit: "cover" }}
        />
      )}
      <Section style={{ padding: "20px 24px 24px" }}>
        <Text
          style={{
            margin: "0 0 6px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLOR.accent,
          }}
        >
          Top pick this week
        </Text>
        <Heading
          as="h2"
          style={{ margin: "0 0 6px", fontSize: "22px", lineHeight: "1.25", color: COLOR.textPrimary }}
        >
          {niche.topic}
        </Heading>
        <Text style={{ margin: "0 0 12px", fontSize: "13px", color: COLOR.textSecondary }}>
          {prettyFormat(niche.format)}
          {"  ·  "}
          {niche.band === "unproven" ? "" : ""}
        </Text>
        <Row style={{ marginBottom: "16px" }}>
          <Column>
            <Text style={{ margin: 0, fontSize: "13px", color: COLOR.textSecondary }}>
              <strong style={{ color: COLOR.textPrimary }}>{niche.channelCount}</strong> channels
              {"   "}
              <strong style={{ color: COLOR.textPrimary }}>{formatViews(niche.avgViews)}</strong> avg
              views
              {niche.band === "unproven" ? "   " : ""}
            </Text>
          </Column>
          {niche.band === "unproven" && (
            <Column align="right">
              <UnprovenPill />
            </Column>
          )}
        </Row>
        <Button
          href={`${APP_URL}/niches/${niche.id}`}
          style={{
            backgroundColor: COLOR.accent,
            color: COLOR.accentFg,
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: 600,
            padding: "11px 20px",
            textDecoration: "none",
          }}
        >
          Investigate this niche →
        </Button>
      </Section>
    </Section>
  );
}

function CondensedRow({ niche }: { niche: DigestNiche }) {
  const thumb = thumbUrl(niche.thumbnailId);
  return (
    <Section
      style={{
        backgroundColor: COLOR.card,
        border: `1px solid ${COLOR.border}`,
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "10px",
      }}
    >
      <Row>
        {thumb && (
          <Column style={{ width: "96px", paddingRight: "12px", verticalAlign: "top" }}>
            <Img
              src={thumb}
              alt=""
              width="96"
              height="54"
              style={{ display: "block", borderRadius: "6px", objectFit: "cover" }}
            />
          </Column>
        )}
        <Column style={{ verticalAlign: "top" }}>
          <Link
            href={`${APP_URL}/niches/${niche.id}`}
            style={{ fontSize: "15px", fontWeight: 600, color: COLOR.textPrimary, textDecoration: "none" }}
          >
            {niche.topic}
          </Link>
          <Text style={{ margin: "3px 0 0", fontSize: "12px", color: COLOR.textTertiary }}>
            {prettyFormat(niche.format)} · {niche.channelCount} channels · {formatViews(niche.avgViews)} avg
            {niche.band === "unproven" ? " · " : ""}
            {niche.band === "unproven" ? "unproven" : ""}
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

export function DigestEmail(props: DigestEmailProps): React.JSX.Element {
  const { weekStart, hero, rest } = props;
  return (
    <Html>
      <Head />
      <Preview>
        {hero ? `This week's top niche: ${hero.topic}` : `Niches digest — week of ${weekStart}`}
      </Preview>
      <Body
        style={{
          backgroundColor: COLOR.bg,
          margin: 0,
          padding: "24px 0",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "0 16px" }}>
          <Section style={{ padding: "4px 0 18px" }}>
            <Text
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: COLOR.textTertiary,
              }}
            >
              Shorts OS
            </Text>
            <Heading as="h1" style={{ margin: "4px 0 0", fontSize: "20px", color: COLOR.textPrimary }}>
              This week&apos;s niches
            </Heading>
            <Text style={{ margin: "2px 0 0", fontSize: "13px", color: COLOR.textSecondary }}>
              Week of {weekStart}
            </Text>
          </Section>

          {hero ? (
            <>
              <HeroCard niche={hero} />
              {rest.length > 0 && (
                <>
                  <Text
                    style={{
                      margin: "8px 0 12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: COLOR.textTertiary,
                    }}
                  >
                    More to explore
                  </Text>
                  {rest.map((n) => (
                    <CondensedRow key={n.id} niche={n} />
                  ))}
                </>
              )}
            </>
          ) : (
            <Section
              style={{
                backgroundColor: COLOR.card,
                border: `1px solid ${COLOR.border}`,
                borderRadius: "12px",
                padding: "28px 24px",
                textAlign: "center" as const,
              }}
            >
              <Text style={{ margin: 0, fontSize: "14px", color: COLOR.textSecondary }}>
                No niches surfaced this week. The Monday cluster run didn&apos;t produce any digest-ranked
                clusters.
              </Text>
            </Section>
          )}

          <Hr style={{ borderColor: COLOR.border, margin: "24px 0 16px" }} />
          <Text style={{ margin: 0, fontSize: "11px", color: COLOR.textTertiary, textAlign: "center" as const }}>
            <Link href={`${APP_URL}/niches`} style={{ color: COLOR.textTertiary }}>
              Open the Niche Finder
            </Link>{" "}
            · Shorts OS weekly digest
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default DigestEmail;
