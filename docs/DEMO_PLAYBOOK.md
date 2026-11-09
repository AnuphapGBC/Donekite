# DoneKite — first small business automation showcase

Project: DoneKite Automation. Fictional business: Maple & Shine Cleaning Services.

## Purpose
Demonstrate one practical service-business workflow: enquiry → reviewed quote → unanswered quote follow-up → acceptance → invoice → recorded payment.

This is a browser-only demonstrator. It uses no paid model, email, payment, or database API. The app does not send messages, collect money, schedule real work, or validate customer identity. All customer and business names are illustrative. Use fictional information. Data is saved with localStorage on the current browser and origin; no shared customer records or real background jobs are provided.

## Two-minute owner conversation
1. Ask: “When you’re on a job, who follows up on the enquiries?”
2. Select **Run 2-minute demo**. A sample Taylor Morgan enquiry is captured and a quote is prepared. The guided demo enables all three rules.
3. Review the quote: three bedrooms × $95 = $285, sample tax $37.05, total $322.05 CAD.
4. Simulate sending the quote. No real email is sent.
5. Advance 48 hours. One follow-up draft is prepared. Advance again to demonstrate that a duplicate reminder is not created.
6. Record acceptance. An invoice is prepared automatically when that rule is enabled.
7. Simulate payment. No charge is made. Show the record’s Activity tab.
8. Enter the owner’s assumptions in **Impact estimate**. Discuss potential capacity, not promised revenue.

## Discovery questions
- How many enquiries arrive each week, and through which channels?
- Where do you track them now?
- Which requests get delayed or forgotten?
- How long does quoting, following up, and invoicing take?
- Who approves the price, the outgoing message, and customer acceptance?
- Is there a repeated process that makes a small pilot worthwhile?

## Demonstration rules
- New enquiries get an automatic quote draft only when the quote rule is enabled. Otherwise, the same pricing preview is available for manual review.
- Price snapshots are stored with each enquiry. Rate changes apply to future enquiries only.
- Duplicate open enquiries with the same normalized email and service are rejected. Closed and paid records do not block new jobs.
- The follow-up rule creates one unsent draft after 48 simulated hours, only for unanswered quotes. A pending record is skipped after acceptance, closure, or payment.
- Demo time moves only with the “Advance 48 hours” control or the guided demo. It is not a wall-clock scheduler.
- If automatic invoicing is paused, an accepted quote waits at Accepted until the owner prepares the invoice manually.
- Payment is a manual demo status, not evidence of an actual transaction.
- Sample pricing is per bedroom for residential services, per estimated hour for office cleaning. Sample tax is 13%; this is not a tax or pricing recommendation.

## Impact formula
Monthly hours = enquiries × max(0, minutes before − minutes after) ÷ 60.
Potential time value = monthly hours × hourly value. Assumptions, not measured results; excludes implementation, software, maintenance, and review costs.
Default: 40 enquiries × (20 − 5) minutes ÷ 60 = 10 hours/month. At $30/hour, illustrative capacity value is $300/month.

## A tightly scoped first pilot
Choose one willing service-business owner, one enquiry channel, and one repeatable service. Agree written scope before integrating real systems. Measure one week of baseline admin time. A practical pilot adds a real form, shared storage, authenticated owner access, email drafts or explicitly approved sending, a scheduler, and error monitoring. Measure time saved and exceptions after a week. Expand only if the owner sees value.

Suggested implementation choices can use tools the customer already has: Microsoft Forms / SharePoint / Power Automate in a Microsoft environment, or an existing website form with a simple backend. Verify current licensing and email-sending requirements before committing to a stack. The demo does not make pricing claims about third-party services.

## Portfolio wording
“Built a small-business enquiry-to-invoice automation demonstrator with configurable rules, reviewed quotes, scheduled-work simulation, duplicate protection, an activity log, and a transparent impact estimator.”

Describe time savings as illustrative until measured in an actual pilot. Do not describe the fictional business as a client.
