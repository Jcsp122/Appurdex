import crypto from "node:crypto";
import Stripe from "stripe";
import { Resend } from "resend";
import {
  consumeMagicLink,
  createCustomerApiKey,
  createMagicLink,
  createSession,
  deleteSession,
  effectivePlan,
  findCustomerApiKey,
  getApiUsageSummary,
  getPlanLimits,
  getSession,
  getUserById,
  getUserByStripeCustomerId,
  hasAccess,
  hashToken,
  recordApiUsage,
  updateUserStripeFields,
  upsertOAuthAccount,
  upsertSubscriptionFromStripe,
  upsertUserByEmail,
} from "./customer-store.mjs";

const SESSION_COOKIE = "appurdex_session";
const OAUTH_STATE_COOKIE = "appurdex_oauth_state";
let stripeClient = null;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function configuredBaseUrl(request) {
  const configured = process.env.APP_BASE_URL || "";
  if (configured) return configured.replace(/\/$/, "");
  return `http://${request.headers.host}`;
}

function missingEnv(keys) {
  return keys.filter((key) => !process.env[key]);
}

function enabledFlag(key) {
  return String(process.env[key] || "").toLowerCase() === "true";
}

const emailMagicLinkEnv = ["SESSION_SECRET", "APP_BASE_URL", "RESEND_API_KEY", "EMAIL_FROM"];
const googleEnv = ["SESSION_SECRET", "APP_BASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const appleEnv = ["SESSION_SECRET", "APP_BASE_URL", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"];
const stripeCoreEnv = ["STRIPE_SECRET_KEY", "APP_BASE_URL"];
const stripeWebhookEnv = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
const stripePriceEnv = ["STRIPE_PRICE_STARTER_MONTHLY", "STRIPE_PRICE_STARTER_ANNUAL", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_ANNUAL"];

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function cookieAttributes(request, maxAgeSeconds) {
  const secure = configuredBaseUrl(request).startsWith("https://");
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function setCookie(response, request, name, value, maxAgeSeconds) {
  const nextCookie = `${name}=${encodeURIComponent(value)}; ${cookieAttributes(request, maxAgeSeconds)}`;
  const existing = response.getHeader("Set-Cookie");
  const cookies = Array.isArray(existing) ? existing : existing ? [existing] : [];
  response.setHeader("Set-Cookie", [...cookies, nextCookie]);
}

function clearCookie(response, request, name) {
  setCookie(response, request, name, "", 0);
}

export function requestSession(request) {
  const cookies = parseCookies(request);
  return getSession(cookies[SESSION_COOKIE]);
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    subscriptionStatus: user.subscription_status,
    planId: effectivePlan(user),
    stripeCustomerId: user.stripe_customer_id || null,
    stripeSubscriptionId: user.stripe_subscription_id || null,
  };
}

function redirect(response, status, location) {
  response.writeHead(status, { Location: location, "Cache-Control": "no-store" });
  response.end();
}

export function authConfig() {
  const emailMissing = missingEnv(emailMagicLinkEnv);
  const googleMissing = missingEnv(googleEnv);
  const appleMissing = missingEnv(appleEnv);
  const stripeMissing = missingEnv([...stripeCoreEnv, "STRIPE_WEBHOOK_SECRET", ...stripePriceEnv]);
  const googleEnabled = enabledFlag("APPURDEX_ENABLE_GOOGLE_LOGIN");
  const appleEnabled = enabledFlag("APPURDEX_ENABLE_APPLE_LOGIN");
  const billingEnabled = enabledFlag("APPURDEX_ENABLE_BILLING");

  return {
    emailMagicLink: emailMissing.length === 0,
    google: googleEnabled && googleMissing.length === 0,
    apple: appleEnabled && appleMissing.length === 0,
    stripe: billingEnabled && stripeMissing.length === 0,
    billing: billingEnabled && stripeMissing.length === 0,
    missingEnv: {
      emailMagicLink: emailMissing,
      google: googleEnabled ? googleMissing : [],
      apple: appleEnabled ? appleMissing : [],
      stripe: billingEnabled ? stripeMissing : [],
    },
    enabled: {
      google: googleEnabled,
      apple: appleEnabled,
      billing: billingEnabled,
    },
  };
}

function jsonMissing(json, response, keys, label) {
  return json(response, 503, {
    error: `${label} is not configured.`,
    missingEnv: keys,
  });
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" });
  return stripeClient;
}

function priceMap() {
  return new Map([
    [process.env.STRIPE_PRICE_STARTER_MONTHLY, { planId: "starter", interval: "monthly" }],
    [process.env.STRIPE_PRICE_STARTER_ANNUAL, { planId: "starter", interval: "annual" }],
    [process.env.STRIPE_PRICE_PRO_MONTHLY, { planId: "pro", interval: "monthly" }],
    [process.env.STRIPE_PRICE_PRO_ANNUAL, { planId: "pro", interval: "annual" }],
    [process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY, { planId: "enterprise", interval: "monthly" }],
    [process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL, { planId: "enterprise", interval: "annual" }],
  ].filter(([priceId]) => priceId));
}

function priceFor(planId, interval) {
  const entries = [
    { planId: "starter", interval: "monthly", env: "STRIPE_PRICE_STARTER_MONTHLY" },
    { planId: "starter", interval: "annual", env: "STRIPE_PRICE_STARTER_ANNUAL" },
    { planId: "pro", interval: "monthly", env: "STRIPE_PRICE_PRO_MONTHLY" },
    { planId: "pro", interval: "annual", env: "STRIPE_PRICE_PRO_ANNUAL" },
    { planId: "enterprise", interval: "monthly", env: "STRIPE_PRICE_ENTERPRISE_MONTHLY" },
    { planId: "enterprise", interval: "annual", env: "STRIPE_PRICE_ENTERPRISE_ANNUAL" },
  ];
  const match = entries.find((entry) => entry.planId === planId && entry.interval === interval);
  return match ? { priceId: process.env[match.env], envName: match.env } : null;
}
function planFromPrice(priceId) {
  return priceMap().get(priceId)?.planId || "free";
}

function subscriptionFields(subscription) {
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id || null;
  return {
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status || "incomplete",
    planId: planFromPrice(priceId),
    priceId,
    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  };
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function decodeJwtPayload(token) {
  const [, payload] = String(token || "").split(".");
  if (!payload) return null;
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function appleClientSecret() {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_KEY_ID }));
  const payload = base64Url(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID,
    iat: nowSeconds(),
    exp: nowSeconds() + 60 * 60,
    aud: "https://appleid.apple.com",
    sub: process.env.APPLE_CLIENT_ID,
  }));
  const signer = crypto.createSign("SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const privateKey = String(process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

async function exchangeGoogleCode(code, redirectUri) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(tokenBody.error_description || tokenBody.error || `Google token exchange failed with ${response.status}`);
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) throw new Error(profile.error_description || profile.error || `Google profile fetch failed with ${profileResponse.status}`);
  if (!profile.email || profile.email_verified === false) throw new Error("Google did not return a verified email.");
  return profile;
}

async function exchangeAppleCode(code, redirectUri) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_CLIENT_ID,
      client_secret: appleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(tokenBody.error_description || tokenBody.error || `Apple token exchange failed with ${response.status}`);
  const profile = decodeJwtPayload(tokenBody.id_token);
  if (!profile?.sub) throw new Error("Apple did not return an account identifier.");
  if (!profile.email) throw new Error("Apple did not return an email for this authorization. Reauthorize with email sharing enabled or link the account by email first.");
  return profile;
}

function setLoggedInSession(response, request, user) {
  const session = createSession(user.id);
  setCookie(response, request, SESSION_COOKIE, session.id, 30 * 86400);
}

async function syncStripeSubscription(stripe, subscription, explicitUserId = null) {
  const fields = subscriptionFields(subscription);
  let user = explicitUserId ? getUserById(explicitUserId) : null;
  if (!user && fields.stripeCustomerId) user = getUserByStripeCustomerId(fields.stripeCustomerId);
  if (!user) return null;
  return upsertSubscriptionFromStripe({ userId: user.id, ...fields });
}

function usageHeaders(usage) {
  return {
    "x-appurdex-limit": usage.limit === null ? "custom" : String(usage.limit),
    "x-appurdex-remaining": usage.remaining === null ? "custom" : String(usage.remaining),
    "x-appurdex-reset": usage.resetAt,
  };
}

export function authenticateCustomerApiKey(request, route) {
  const token = request.headers["x-appurdex-api-key"] || request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const match = findCustomerApiKey(token);
  if (!match) return null;
  if (!hasAccess(match.user, "apiAccess")) {
    return { ok: false, status: 403, error: "This API key does not have subscriber API access." };
  }
  const currentUsage = getApiUsageSummary(match.user);
  if (currentUsage.overLimit) {
    return { ok: false, status: 429, error: "Monthly Appurdex API request limit reached.", usage: currentUsage, headers: usageHeaders(currentUsage) };
  }
  const usage = recordApiUsage({ apiKeyId: match.key.id, userId: match.user.id, route });
  return { ok: true, user: match.user, key: match.key, usage, headers: usageHeaders(usage) };
}

export async function handleAuthBillingRoute(request, response, url, helpers) {
  const { json, readJson, readRawBody } = helpers;
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/auth/me") {
    const session = requestSession(request);
    const user = session?.user || null;
    return json(response, 200, {
      user: serializeUser(user),
      access: {
        viewOverview: hasAccess(user, "viewOverview"),
        viewVendorDetail: hasAccess(user, "viewVendorDetail"),
        compareProducts: hasAccess(user, "compareProducts"),
        compareProductsUnlimited: hasAccess(user, "compareProductsUnlimited"),
        sourceBackedPricing: hasAccess(user, "sourceBackedPricing"),
        dataConfidence: hasAccess(user, "dataConfidence"),
        usageDashboard: hasAccess(user, "usageDashboard"),
        priorityFreshness: hasAccess(user, "priorityFreshness"),
        historicalTrends: hasAccess(user, "historicalTrends"),
        csvExport: hasAccess(user, "csvExport"),
        apiAccess: hasAccess(user, "apiAccess"),
        alerts: hasAccess(user, "alerts"),
        watchlists: hasAccess(user, "watchlists"),
        savedComparisons: hasAccess(user, "savedComparisons"),
        webhooks: hasAccess(user, "webhooks"),
        appurScore: hasAccess(user, "appurScore"),
        bulkApiExport: hasAccess(user, "bulkApiExport"),
        whiteLabelReports: hasAccess(user, "whiteLabelReports"),
      },
      limits: getPlanLimits(user),
      usage: getApiUsageSummary(user),
      config: authConfig(),
    });
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const cookies = parseCookies(request);
    if (cookies[SESSION_COOKIE]) deleteSession(cookies[SESSION_COOKIE]);
    clearCookie(response, request, SESSION_COOKIE);
    return json(response, 200, { ok: true });
  }

  if (request.method === "POST" && pathname === "/api/auth/email/start") {
    const missing = missingEnv(emailMagicLinkEnv);
    if (missing.length) return jsonMissing(json, response, missing, "Email magic link sign-in");
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return json(response, 400, { error: "A valid email is required." });
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    createMagicLink(email, hashToken(token), expiresAt);
    const link = `${configuredBaseUrl(request)}/api/auth/email/verify?token=${encodeURIComponent(token)}`;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Sign in to Appurdex",
      text: `Sign in to Appurdex: ${link}\n\nThis link expires in 15 minutes.`,
      html: `<p>Sign in to Appurdex:</p><p><a href="${link}">Open Appurdex</a></p><p>This link expires in 15 minutes.</p>`,
    });
    if (result.error) return json(response, 502, { error: result.error.message || "Resend failed to send the magic link." });
    return json(response, 200, { ok: true, expiresAt });
  }

  if (request.method === "GET" && pathname === "/api/auth/email/verify") {
    const token = url.searchParams.get("token") || "";
    const consumed = consumeMagicLink(hashToken(token));
    if (!consumed.ok) return redirect(response, 302, `/api?auth=failed&reason=${encodeURIComponent(consumed.error)}`);
    const user = upsertUserByEmail(consumed.email);
    setLoggedInSession(response, request, user);
    return redirect(response, 302, "/api?auth=ok");
  }

  if (request.method === "GET" && pathname === "/api/auth/google/start") {
    if (!enabledFlag("APPURDEX_ENABLE_GOOGLE_LOGIN")) return jsonMissing(json, response, ["APPURDEX_ENABLE_GOOGLE_LOGIN"], "Google sign-in");
    const missing = missingEnv(googleEnv);
    if (missing.length) return jsonMissing(json, response, missing, "Google sign-in");
    const state = crypto.randomBytes(24).toString("base64url");
    setCookie(response, request, OAUTH_STATE_COOKIE, `google.${state}`, 10 * 60);
    const redirectUri = `${configuredBaseUrl(request)}/api/auth/google/callback`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    }).toString();
    return redirect(response, 302, authUrl.toString());
  }

  if (request.method === "GET" && pathname === "/api/auth/google/callback") {
    const cookies = parseCookies(request);
    if (cookies[OAUTH_STATE_COOKIE] !== `google.${url.searchParams.get("state") || ""}`) return redirect(response, 302, "/api?auth=failed&reason=oauth_state");
    const code = url.searchParams.get("code");
    if (!code) return redirect(response, 302, "/api?auth=failed&reason=missing_code");
    try {
      const redirectUri = `${configuredBaseUrl(request)}/api/auth/google/callback`;
      const profile = await exchangeGoogleCode(code, redirectUri);
      const user = upsertOAuthAccount({ provider: "google", providerAccountId: profile.sub, email: profile.email, profile });
      setLoggedInSession(response, request, user);
      clearCookie(response, request, OAUTH_STATE_COOKIE);
      return redirect(response, 302, "/api?auth=ok");
    } catch (error) {
      return redirect(response, 302, `/api?auth=failed&reason=${encodeURIComponent(error.message)}`);
    }
  }

  if (request.method === "GET" && pathname === "/api/auth/apple/start") {
    if (!enabledFlag("APPURDEX_ENABLE_APPLE_LOGIN")) return jsonMissing(json, response, ["APPURDEX_ENABLE_APPLE_LOGIN"], "Apple Sign-In");
    const missing = missingEnv(appleEnv);
    if (missing.length) return jsonMissing(json, response, missing, "Apple Sign-In");
    const state = crypto.randomBytes(24).toString("base64url");
    setCookie(response, request, OAUTH_STATE_COOKIE, `apple.${state}`, 10 * 60);
    const authUrl = new URL("https://appleid.apple.com/auth/authorize");
    authUrl.search = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID,
      redirect_uri: `${configuredBaseUrl(request)}/api/auth/apple/callback`,
      response_type: "code",
      response_mode: "form_post",
      scope: "name email",
      state,
    }).toString();
    return redirect(response, 302, authUrl.toString());
  }

  if (request.method === "POST" && pathname === "/api/auth/apple/callback") {
    const rawBody = await readRawBody(request);
    const form = new URLSearchParams(rawBody.toString("utf8"));
    const cookies = parseCookies(request);
    if (cookies[OAUTH_STATE_COOKIE] !== `apple.${form.get("state") || ""}`) return redirect(response, 302, "/api?auth=failed&reason=oauth_state");
    const code = form.get("code");
    if (!code) return redirect(response, 302, "/api?auth=failed&reason=missing_code");
    try {
      const profile = await exchangeAppleCode(code, `${configuredBaseUrl(request)}/api/auth/apple/callback`);
      const user = upsertOAuthAccount({ provider: "apple", providerAccountId: profile.sub, email: profile.email, profile });
      setLoggedInSession(response, request, user);
      clearCookie(response, request, OAUTH_STATE_COOKIE);
      return redirect(response, 302, "/api?auth=ok");
    } catch (error) {
      return redirect(response, 302, `/api?auth=failed&reason=${encodeURIComponent(error.message)}`);
    }
  }

  if (request.method === "POST" && pathname === "/api/auth/api-keys") {
    const session = requestSession(request);
    if (!session?.user) return json(response, 401, { error: "Sign in before creating an API key." });
    if (!hasAccess(session.user, "apiAccess")) return json(response, 403, { error: "This account cannot create API keys." });
    const body = await readJson(request);
    const key = createCustomerApiKey({ userId: session.user.id, name: body.name || "Appurdex API key" });
    return json(response, 201, { ok: true, apiKey: key });
  }

  if (request.method === "POST" && pathname === "/api/billing/create-checkout-session") {
    if (!enabledFlag("APPURDEX_ENABLE_BILLING")) return jsonMissing(json, response, ["APPURDEX_ENABLE_BILLING"], "Stripe Checkout");
    const missing = missingEnv(stripeCoreEnv);
    if (missing.length) return jsonMissing(json, response, missing, "Stripe Checkout");
    const session = requestSession(request);
    if (!session?.user) return json(response, 401, { error: "Sign in before starting checkout." });
    const body = await readJson(request);
    const planId = ["starter", "pro", "enterprise"].includes(body.planId) ? body.planId : "pro";
    const interval = body.interval === "annual" ? "annual" : "monthly";
    const price = priceFor(planId, interval);
    if (!price?.priceId) return jsonMissing(json, response, [price?.envName || "STRIPE_PRICE_PRO_MONTHLY"], "Stripe price");

    const stripe = getStripe();
    let user = session.user;
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { appurdexUserId: user.id } });
      user = updateUserStripeFields(user.id, { stripe_customer_id: customer.id }) || user;
      customerId = customer.id;
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: price.priceId, quantity: 1 }],
      success_url: `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api?checkout=success`,
      cancel_url: `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api?checkout=cancelled`,
      subscription_data: { metadata: { appurdexUserId: user.id, planId } },
      metadata: { appurdexUserId: user.id, planId },
    });
    return json(response, 200, { ok: true, url: checkout.url, sessionId: checkout.id });
  }

  if (request.method === "POST" && pathname === "/api/billing/create-portal-session") {
    if (!enabledFlag("APPURDEX_ENABLE_BILLING")) return jsonMissing(json, response, ["APPURDEX_ENABLE_BILLING"], "Stripe customer portal");
    const missing = missingEnv(stripeCoreEnv);
    if (missing.length) return jsonMissing(json, response, missing, "Stripe customer portal");
    const session = requestSession(request);
    if (!session?.user) return json(response, 401, { error: "Sign in before opening the customer portal." });
    if (!session.user.stripe_customer_id) return json(response, 400, { error: "This account does not have a Stripe customer yet." });
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: session.user.stripe_customer_id,
      return_url: `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api`,
    });
    return json(response, 200, { ok: true, url: portal.url });
  }

  if (request.method === "POST" && pathname === "/api/billing/webhook") {
    if (!enabledFlag("APPURDEX_ENABLE_BILLING")) return jsonMissing(json, response, ["APPURDEX_ENABLE_BILLING"], "Stripe webhook");
    const missing = missingEnv(stripeWebhookEnv);
    if (missing.length) return jsonMissing(json, response, missing, "Stripe webhook");
    const stripe = getStripe();
    const rawBody = await readRawBody(request);
    const signature = request.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      return json(response, 400, { error: `Stripe webhook signature verification failed: ${error.message}` });
    }

    if (event.type === "checkout.session.completed") {
      const checkout = event.data.object;
      if (checkout.subscription) {
        const subscription = await stripe.subscriptions.retrieve(checkout.subscription);
        await syncStripeSubscription(stripe, subscription, checkout.client_reference_id || checkout.metadata?.appurdexUserId);
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncStripeSubscription(stripe, event.data.object);
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const subscription = typeof invoice.subscription === "string" ? await stripe.subscriptions.retrieve(invoice.subscription) : invoice.subscription;
        await syncStripeSubscription(stripe, subscription);
      }
    }

    return json(response, 200, { received: true });
  }

  return false;
}





