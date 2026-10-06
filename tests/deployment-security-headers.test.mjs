import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.DEPLOYMENT_BASE_URL;

test(
  "production responses apply strict, request-specific security headers",
  { skip: baseUrl ? false : "Set DEPLOYMENT_BASE_URL to a running production server." },
  async () => {
    const inspect = async (path) => {
      const response = await fetch(new URL(path, baseUrl), {
        cache: "no-store",
        redirect: "manual",
      });
      assert.ok(response.status < 500, `${path} returned HTTP ${response.status}`);

      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(
        response.headers.get("referrer-policy"),
        "strict-origin-when-cross-origin",
      );
      assert.match(
        response.headers.get("strict-transport-security") ?? "",
        /^max-age=31536000$/,
      );
      assert.equal(
        response.headers.get("permissions-policy"),
        "camera=(), geolocation=(), microphone=()",
      );
      assert.equal(response.headers.get("x-powered-by"), null);
      assert.match(
        response.headers.get("cache-control") ?? "",
        /private|no-store/i,
        `${path} must not be shared-cached`,
      );

      const csp = response.headers.get("content-security-policy");
      assert.ok(csp, `${path} is missing Content-Security-Policy`);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /base-uri 'self'/);
      assert.match(csp, /form-action 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /style-src-attr 'none'/);
      assert.match(csp, /upgrade-insecure-requests/);

      const scriptSource = csp.match(/(?:^|;\s*)script-src ([^;]+)/)?.[1] ?? "";
      const styleSource = csp.match(/(?:^|;\s*)style-src ([^;]+)/)?.[1] ?? "";
      assert.match(scriptSource, /'strict-dynamic'/);
      assert.doesNotMatch(scriptSource, /'unsafe-inline'|'unsafe-eval'/);
      assert.doesNotMatch(styleSource, /'unsafe-inline'/);

      const nonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      assert.ok(nonce, `${path} is missing its script/style nonce`);

      const html = await response.text();
      for (const [scriptTag] of html.matchAll(/<script\b[^>]*>/gi)) {
        assert.match(
          scriptTag,
          new RegExp(`\\bnonce=["']${nonce}["']`, "i"),
          `${path} contains a script without the response nonce`,
        );
      }
      for (const [styleTag] of html.matchAll(/<style\b[^>]*>/gi)) {
        assert.match(
          styleTag,
          new RegExp(`\\bnonce=["']${nonce}["']`, "i"),
          `${path} contains an inline style without the response nonce`,
        );
      }
      const renderedHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
      assert.doesNotMatch(
        renderedHtml,
        /<[^>]+\sstyle=/i,
        `${path} contains a style attribute blocked by style-src-attr 'none'`,
      );

      return {
        nonce,
        status: response.status,
        location: response.headers.get("location"),
      };
    };

    const landing = await inspect("/");
    const signup = await inspect("/signup");
    const protectedPage = await inspect("/dues");
    const notFound = await inspect("/does-not-exist");

    assert.equal(
      new Set([landing.nonce, signup.nonce, protectedPage.nonce, notFound.nonce]).size,
      4,
    );
    assert.ok(
      [301, 302, 303, 307, 308].includes(protectedPage.status),
      "unauthenticated dues access must redirect",
    );
    assert.ok(protectedPage.location, "protected-page redirect needs a destination");
    const destination = new URL(protectedPage.location, baseUrl);
    assert.equal(destination.origin, new URL(baseUrl).origin);
    assert.equal(destination.pathname, "/");
    assert.equal(notFound.status, 404);
  },
);
