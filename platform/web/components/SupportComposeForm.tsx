"use client";

import type { FormEvent } from "react";

type Props = { formReady: boolean; supportAddress: string; siteKey?: string };

export function SupportComposeForm({ formReady, supportAddress, siteKey }: Props) {
  function composeEmail(event: FormEvent<HTMLFormElement>) {
    if (formReady) return;
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const category = String(fields.get("category") || "question");
    const email = String(fields.get("email") || "").trim();
    const message = String(fields.get("message") || "").trim();
    const subject = `FirmQuarry support: ${category}`;
    const body = `From: ${email}\nCategory: ${category}\n\n${message}`;
    window.location.href = `mailto:${supportAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form className="fq-support-form" method={formReady ? "post" : undefined} action={formReady ? "/api/support" : undefined} onSubmit={composeEmail}>
      <div className="fq-support-form-top">
        <span className="fq-support-form-icon" aria-hidden="true">✳</span>
        <div>
          <p className="fq-section-eyebrow">SEND A MESSAGE</p>
          <h2>What can we help with?</h2>
        </div>
      </div>
      <label>
        <span>Topic</span>
        <select name="category" required defaultValue="question">
          <option value="question">General question</option>
          <option value="bug">Something isn’t working</option>
          <option value="data">Data correction</option>
          <option value="feature">Feature suggestion</option>
          <option value="billing">Account or billing</option>
        </select>
      </label>
      <label>
        <span>Your email address</span>
        <input type="email" name="email" required autoComplete="email" maxLength={254} placeholder="you@company.com" />
      </label>
      <label>
        <span>Message</span>
        <textarea name="message" required minLength={12} maxLength={4000} rows={6} placeholder="Tell us what happened or what you would like to see. Links to specific companies or records help us investigate." />
      </label>
      <label className="fq-support-honeypot" aria-hidden="true">Leave this blank
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {formReady && siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} /> : null}
      <button className="fq-button fq-button-primary fq-support-submit" type="submit">
        {formReady ? "Send message" : "Open email draft"} <span aria-hidden="true">↗</span>
      </button>
      <p className="fq-support-disclaimer">{formReady
        ? "Your note goes directly to FirmQuarry support. We use your email only to follow up."
        : "This opens a prepared message in your email app for you to review and send. Nothing is submitted to the website."}
        {" "}Please don’t include passwords or payment-card information.</p>
    </form>
  );
}
