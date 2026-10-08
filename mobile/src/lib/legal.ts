// Terms of Service and Privacy Policy text, shared by the in-app screens
// (/terms, /privacy) and the public web build that Google Play links to.
//
// DRAFT — written for a small hyperlocal app operating from India. Have it
// reviewed by a lawyer before the public launch, and fill in LEGAL_ENTITY and
// GRIEVANCE_OFFICER. Bump TERMS_VERSION whenever the meaning changes: every
// user is then asked to accept again (see /accept-terms).

import { SUPPORT_EMAIL } from './constants';

export const TERMS_VERSION = '2026-10-09';
export const LEGAL_UPDATED = '9 October 2026';

// TODO(before launch): replace with the real operator and a named Grievance Officer
// (India's IT Rules 2021 require one for platforms with user-generated content).
export const LEGAL_ENTITY = 'pincode (operated by Danish Sultan, Bengaluru, India)';
export const GRIEVANCE_OFFICER = `Grievance Officer: Danish Sultan, ${SUPPORT_EMAIL}`;

export type LegalSection = { title: string; body: string };

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'Accepting these terms',
    body: `By creating an account or using pincode you agree to these Terms and to our Privacy Policy and Community Guidelines. If you do not agree, please do not use the app. pincode is run by ${LEGAL_ENTITY}.`,
  },
  {
    title: 'Who can use pincode',
    body: 'You must be at least 18 years old and able to enter into a binding contract under Indian law. You must give accurate information and keep one account only. You are responsible for everything that happens under your account, so keep your password safe.',
  },
  {
    title: 'What pincode is',
    body: 'pincode helps neighbors ask questions, share recommendations and alerts, and talk to each other. We are a platform: posts, comments and messages are written by users, and we do not verify them. Do not rely on them for medical, legal, financial or safety decisions, and meet people you do not know in public places.',
  },
  {
    title: 'Your content',
    body: 'You own what you post. You give pincode a free, worldwide licence to store, display and distribute it inside the app so the service can work. You promise you have the right to post it. You can delete your posts and comments, or your whole account, at any time.',
  },
  {
    title: 'Zero tolerance for objectionable content',
    body: 'There is no place on pincode for hate, harassment, threats, sexual content, scams, illegal activity, impersonation, spam or content that endangers children. See the Community Guidelines for details. Automated filters and our team review content, and we may remove it and warn, suspend or permanently ban accounts at our discretion.',
  },
  {
    title: 'Reporting and blocking',
    body: 'Every post, comment, message and profile can be reported, and you can block any user. We aim to review reports within 24 hours and act on content that breaks these terms.',
  },
  {
    title: 'What you must not do',
    body: 'Do not break the law, attempt to access other accounts or our systems, scrape data, overload the service, collect other users\' personal information, or use pincode for commercial advertising without our permission.',
  },
  {
    title: 'Ending your account',
    body: 'You can delete your account in Settings or at the /delete-account page of our website. We may suspend or end accounts that break these terms. When an account is deleted, its profile, posts, comments, messages sent and uploaded photos are removed.',
  },
  {
    title: 'No warranty, limited liability',
    body: 'pincode is provided "as is" while it is in beta. To the extent allowed by law, we are not liable for user content, for interactions between users, or for indirect or consequential loss. Nothing here limits liability that cannot be limited by law.',
  },
  {
    title: 'Governing law',
    body: 'These terms are governed by the laws of India. Courts in Bengaluru, Karnataka have jurisdiction, subject to any consumer rights you have to bring a claim elsewhere.',
  },
  {
    title: 'Grievances and contact',
    body: `${GRIEVANCE_OFFICER}. Write to us about content, privacy or any complaint and we will respond within the time required by law.`,
  },
  {
    title: 'Changes',
    body: 'We may update these terms. If a change matters, we will ask you to accept the new version in the app before you continue.',
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'Who we are',
    body: `${LEGAL_ENTITY} runs pincode and decides how your personal data is used. Contact: ${SUPPORT_EMAIL}.`,
  },
  {
    title: 'What we collect',
    body: 'Account: email address, phone number, username, display name, bio, interests and profile photo. Location: the home area you choose, and your precise device location only while you use the app and allow it (to show nearby posts and the map). Content: your posts, comments, reactions, photos you upload, and messages. Technical: a push notification token, app version, device type and crash reports. We do not collect your contacts, and we do not use the microphone or camera.',
  },
  {
    title: 'Why we use it',
    body: 'To create your account and sign you in; to show posts and people near you; to deliver messages and notifications; to keep the community safe (spam, abuse, bans); and to find and fix crashes. We process your data on the basis of your consent, which you give when you accept these terms and allow permissions, under the Digital Personal Data Protection Act, 2023.',
  },
  {
    title: 'No ads, no selling',
    body: 'pincode has no advertising and we do not sell your personal data.',
  },
  {
    title: 'Who sees what',
    body: 'Your username, display name, bio, interests, profile photo, home area and posts are visible to other users. Your email and phone number are private and are not shown to other users. Messages are visible only to the people in the conversation, and to our moderators if a message is reported.',
  },
  {
    title: 'Service providers',
    body: 'We use Supabase (database, sign-in and storage), Expo and Google Firebase (push notifications), Google (sign-in and maps), Sentry (crash reports) and our email delivery provider. They process data only to provide their service to us.',
  },
  {
    title: 'How long we keep it',
    body: 'We keep your data while your account exists. When you delete your account we remove your profile, posts, comments, messages and uploaded photos. Backups are overwritten within about 30 days, and we may keep limited records where the law requires.',
  },
  {
    title: 'Your rights',
    body: `You can access and correct your information in the app, delete your account in Settings or at /delete-account, withdraw consent, nominate someone to exercise your rights, and make a complaint. Write to ${SUPPORT_EMAIL}.`,
  },
  {
    title: 'Security',
    body: 'Data is encrypted in transit and access is restricted by database security rules. No system is perfectly secure, so please use a strong, unique password.',
  },
  {
    title: 'Children',
    body: 'pincode is for adults only (18+). If you believe a child has an account, tell us and we will remove it.',
  },
  {
    title: 'Changes and contact',
    body: `We will tell you in the app when this policy changes in a way that matters. Questions or complaints: ${GRIEVANCE_OFFICER}.`,
  },
];
