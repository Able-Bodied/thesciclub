import { Link } from 'react-router-dom';
import { ContactEmail, LegalPage, List, P, Section } from '@/routes/legal/legal-page';

/**
 * The Privacy Policy, at /privacy.
 *
 * Written for the club, not borrowed from ablebodied.org's, which covers
 * riders and donors and never mentions the app or text messages. What it says
 * the club collects and who sees it is what the code does: change one and
 * the other changes with it. What Able Bodied Inc. does with it beyond the app
 * (matching through organization mentors, grant applications a member asks
 * for) is the owner's answer, 2026-10-01.
 *
 * The bold statements under "Text messages (SMS)" are the wording carriers ask
 * for, and the text-message registration links here: keep them word for word.
 * The campaign was rejected on 2026-10-02 (Twilio error 30908). The first
 * statement is the "passing" sentence from that error's documentation,
 * verbatim; the page also says a privacy policy behind a website opt-in must
 * give the message frequency and "message and data rates may apply", which is
 * the line above it. The older sentence said none of affiliates, promotional or
 * consent. The grant section says it excludes them too, so no sharing clause
 * reads as a conflict.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 3, 2026">
      <Section title="Who we are">
        <P>
          The SCI Club is a private, invite-only community for adults living with spinal cord
          injury. It is run by Able Bodied Inc., a nonprofit organization (“we”, “us”). This policy
          covers The SCI Club app and the text messages it sends.
        </P>
      </Section>

      <Section title="What we collect">
        <P>When you join, and as you use the club, we keep:</P>
        <List>
          <li>
            <b>Your phone number</b>, which is your account.
          </li>
          <li>
            <b>About you:</b> your name, birthday, city and state, and a photograph with its
            description if you add one.
          </li>
          <li>
            <b>About your injury:</b> its level, whether it is complete, when it happened, and how,
            as far as you choose to say.
          </li>
          <li>
            <b>What you choose to answer</b> in the profile questions, such as your languages,
            interests, work, education, family and the topics you want to talk about. Every one of
            them can be left out.
          </li>
          <li>
            <b>What you do in the club:</b> your messages, posts and photographs, the events you
            reply to, the organizations you follow, the posts you like, and anything you report.
          </li>
          <li>
            <b>Your notification settings</b>, if you turn notifications on for a device.
          </li>
        </List>
        <P>
          If you look up your city by ZIP code or by your device’s location, that is used once to
          find a city and state and is not kept. There is no advertising, analytics or tracking in
          the app.
        </P>
      </Section>

      <Section title="How we use it">
        <List>
          <li>To sign you in, and to check that your number is on the club’s invite list.</li>
          <li>
            To show your profile to other members and to suggest peers and mentors to you, using
            things like your injury, your age and where you live.
          </li>
          <li>To show you events, rooms and conversations, and to notify you about them.</li>
          <li>To keep the club safe: looking into reports, and closing an account if needed.</li>
        </List>
      </Section>

      <Section title="Who can see what">
        <List>
          <li>
            <b>Other members</b> see your profile: your name, photograph, injury, age, where you
            live and what you have chosen to share. They never see your phone number or your
            birthday; your age is worked out from your birthday on our side. You can hide yourself
            from Peers, on Me.
          </li>
          <li>
            <b>Mentors and administrators from member organizations</b>, such as hospitals and peer
            support programs, see the same profile inside the app, to help match members with peers
            and mentors. They never see your phone number.
          </li>
          <li>
            <b>Your phone number</b> is shown only to the club’s administrators and to whoever added
            it to the invite list, who already had it. It is never shared outside the club.
          </li>
          <li>
            <b>Direct and group conversations</b> cannot be read by administrators. If somebody
            reports a single message or post, that one message is shown to administrators, with who
            wrote it and when, and nothing else from the conversation.
          </li>
          <li>
            <b>Edits:</b> when you change a post or a message, the earlier wording is kept, and
            administrators can read it. Nobody else can, you included.
          </li>
          <li>
            <b>Photographs</b> are only shown to people signed in to the club. Nobody outside it can
            open them, even with a copied link.
          </li>
        </List>
      </Section>

      <Section title="Grant applications">
        <P>
          If you ask Able Bodied Inc. to help you apply for a grant, such as for equipment or
          adaptive sport, we may share what is on your profile with the grant-maker, only for that
          application and only because you asked. This never includes your phone number or your
          text-message opt-in data and consent.
        </P>
      </Section>

      <Section title="Text messages (SMS)">
        <P>
          We text you a one-time code each time you sign in, and nothing else. Your phone number is
          used to send those codes and to identify your account.
        </P>
        <P>
          <b>Message frequency:</b> one text each time you ask for a sign-in code.{' '}
          <b>Message and data rates may apply.</b>
        </P>
        <P>
          <b>
            We do not share, sell, or provide your mobile phone number or messaging consent data to
            third parties or affiliates for marketing or promotional purposes.
          </b>
        </P>
        <P>
          <b>
            No mobile information will be shared with third parties or affiliates for marketing or
            promotional purposes. Text messaging opt-in data and consent will not be shared with any
            third parties.
          </b>
        </P>
        <P>
          <b>
            We do not sell or share your SMS opt-in data or personal information with third parties
            for marketing purposes.
          </b>
        </P>
        <P>
          Every kind of sharing described in this policy excludes your text messaging opt-in data
          and consent. The only exception is the service providers that send the texts and run the
          app (see Service providers, below), which handle your phone number only so they can do
          that.
        </P>
        <P>
          Text <b>HELP</b> for help and <b>STOP</b> to stop the texts. The{' '}
          <Link to="/terms" className="font-semibold text-emphasis underline">
            Terms of Service
          </Link>{' '}
          say more about them.
        </P>
      </Section>

      {/* Kinds of provider, not their names (the owner, 2026-10-03). The
          kinds are what California's CalOPPA asks a policy to list, and the
          text-message exception above leans on this section being here. */}
      <Section title="Service providers">
        <P>
          We do not sell your information or share it for advertising. We share it only with the
          service providers that run the club for us: hosting, our database and sign-in, text
          messages, location lookup, and device notifications. They receive only what they need to
          do that work.
        </P>
      </Section>

      <Section title="Adults only">
        <P>
          The SCI Club is for people 18 and over. We do not knowingly collect information from
          anybody younger, and the app does not let anybody under 18 join.
        </P>
      </Section>

      <Section title="Deleting your account">
        <P>
          You can delete your account yourself, from <b>Delete my account</b> at the foot of Me.
          That erases your name, phone number, photograph, birthday, injury and everything you
          answered about yourself, and takes your number off the invite list. What you wrote in Chat
          stays, so other people’s conversations still make sense, but it says “Deleted member”
          instead of your name. The other person in a one-to-one conversation can then delete it,
          with everything both of you wrote and every photograph in it. A report keeps its copy of
          the reported words, with nobody named.
        </P>
        <P>
          Administrators cannot delete their own account in the app, and anybody can ask us to
          delete theirs, or for a copy of what we hold about them, by email.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Questions about this policy or your information: <ContactEmail />, or Able Bodied Inc.,
          1968 S. Coast Hwy #3742, Laguna Beach, CA 92651.
        </P>
      </Section>
    </LegalPage>
  );
}
