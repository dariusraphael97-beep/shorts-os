import "server-only";
import { render } from "@react-email/render";
import { DigestEmail } from "@/emails/digest-email";
import type { DigestEmailProps } from "@/lib/digest/build-email-props";

export async function renderDigest(props: DigestEmailProps): Promise<{ html: string; text: string }> {
  const html = await render(DigestEmail(props));
  const text = await render(DigestEmail(props), { plainText: true });
  return { html, text };
}
