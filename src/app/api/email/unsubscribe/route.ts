import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/email-unsubscribe";

/**
 * Unsubscribe endpoint reachable from the email footer.
 *
 * Public (no auth — recipients won't be logged in when they click). Token
 * is the only proof we have that the caller is the user the email was
 * sent to.
 *
 * Renders a small HTML confirmation page in every case — success or
 * error — because this is clicked from a mail client and the user expects
 * a webpage, not JSON. PECR Reg 22 requires the opt-out mechanism to be
 * "simple and free"; one click, no login.
 *
 * GET-vs-POST: real one-click bulk-sender compliance (Gmail / Outlook
 * "List-Unsubscribe-Post: List-Unsubscribe=One-Click") uses POST. We
 * support both verbs; mail clients that pre-fetch GET previews on hover
 * will trigger an idempotent re-write of the same flag (no harm) but
 * Gmail's actual one-click action will POST.
 */
export const runtime = "nodejs";

function renderPage(opts: {
  title: string;
  body: string;
  status: number;
}): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.title}</title>
    <meta name="robots" content="noindex" />
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #111827; }
      .wrap { max-width: 480px; margin: 64px auto; padding: 32px 24px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
      h1 { margin: 0 0 12px; font-size: 20px; }
      p { margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #4b5563; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${opts.title}</h1>
      ${opts.body}
    </div>
  </body>
</html>`;
  return new NextResponse(html, {
    status: opts.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handle(token: string | null): Promise<NextResponse> {
  if (!token) {
    return renderPage({
      title: "Link missing",
      body: `<p>This unsubscribe link is missing its token. If you were sent here from a Coverboard email, please try clicking the link in the email again.</p>`,
      status: 400,
    });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error(
      "NEXTAUTH_SECRET is not configured — cannot verify unsubscribe tokens"
    );
    return renderPage({
      title: "Something went wrong",
      body: `<p>We couldn&rsquo;t process your unsubscribe right now. Please email <a href="mailto:support@coverboard.io">support@coverboard.io</a> and we&rsquo;ll opt you out manually.</p>`,
      status: 500,
    });
  }

  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified.ok) {
    const human =
      verified.reason === "expired"
        ? "This unsubscribe link has expired. Sign in to your Coverboard account and turn off the weekly digest from your profile settings."
        : "This unsubscribe link is invalid. If you were sent here from a Coverboard email, please use the link in your most recent digest, or sign in and update your preferences manually.";
    return renderPage({
      title: "Couldn't unsubscribe",
      body: `<p>${human}</p><p><a href="/login">Sign in to Coverboard</a></p>`,
      status: 400,
    });
  }

  if (verified.payload.k !== "weekly_digest") {
    // Future-proofing: a token issued for a different unsubscribe surface
    // shouldn't accidentally toggle the digest preference.
    return renderPage({
      title: "Wrong link",
      body: `<p>This link is for a different kind of email. Sign in to manage your preferences.</p>`,
      status: 400,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: verified.payload.uid },
    select: { id: true, email: true, digestOptOut: true },
  });
  if (!user) {
    // User was deleted between sending and clicking — treat as success so
    // we don't leak "this account doesn't exist".
    return renderPage({
      title: "Unsubscribed",
      body: `<p>You&rsquo;ve been unsubscribed from the Coverboard weekly digest.</p>`,
      status: 200,
    });
  }

  if (!user.digestOptOut) {
    await prisma.user.update({
      where: { id: user.id },
      data: { digestOptOut: true },
    });
  }

  return renderPage({
    title: "Unsubscribed",
    body: `<p>You&rsquo;re unsubscribed from the Coverboard weekly digest. We&rsquo;ll stop sending it to <strong>${user.email}</strong>.</p>
           <p>You can re-enable it any time from your <a href="/settings/profile">profile settings</a>.</p>`,
    status: 200,
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  return handle(token);
}

// Gmail / Outlook one-click bulk-sender flow POSTs to the list-unsubscribe URL.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  return handle(token);
}
