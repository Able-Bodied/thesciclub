import { Link } from 'react-router-dom';
import { ContactEmail, LegalPage, List, P, Section } from '@/routes/legal/legal-page';

/**
 * The Privacy Policy, at /privacy.
 *
 * Written for the club, not borrowed from ablebodied.org's, which covers
 * riders and donors and never mentions the app. What it says the club collects
 * and who sees it is what the code does: change one and the other changes
 * with it. What Able Bodied Inc. does with it beyond the app (matching through
 * organization mentors, grant applications a member asks for) is the owner's
 * answer, 2026-10-01.
 *
 * Rewritten 2026-10-10 for email sign-in (EMAIL-SIGN-IN-PLAN.md). The club no
 * longer sends text messages, so the SMS section and the carriers' wording
 * went with the Twilio registration, which was never approved. A phone number
 * is now optional and only for the host of an event the member chose Going for.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 15, 2026">
      <Section title="Who we are">
        <P>
          The SCI Club is a private, invite-only community for adults living with spinal cord
          injury. It is run by Able Bodied Inc., a nonprofit organization (“we”, “us”). This policy
          covers The SCI Club app and the emails it sends.
        </P>
      </Section>

      <Section title="What we collect">
        <P>When you join, and as you use the club, we keep:</P>
        <List>
          <li>
            <b>Your email address</b>, which is your account, and a password if you choose one. We
            keep a scrambled form of the password, never the password itself.
          </li>
          <li>
            <b>About you:</b> your name, your username (the <b>@name</b> others see), your birthday,
            city and state, and a photograph with its description if you add one.
          </li>
          <li>
            <b>A phone number, only if you add one</b>, for the hosts of events you choose Going
            for. It is never used to sign you in.
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
            <b>Your answers while you join:</b> what you have answered so far and the step you are
            on, so you can pick up where you left off, on this device or another. They are deleted
            once you finish joining, or after 90 days if you do not. We also note which steps you
            reached; administrators see only how many people reached each step, never who.
          </li>
          <li>
            <b>Your notification settings</b>, if you turn notifications on for a device.
          </li>
          <li>
            <b>If you sign in with Google or Apple:</b> the name, email address and account number
            they send us. If you use Apple’s Hide My Email, the address we hold is the one Apple
            makes for us.
          </li>
          <li>
            <b>If you add a passkey:</b> a public key and the name of the device it is on. Your
            fingerprint or face never leaves your device.
          </li>
        </List>
        <P>
          If you look up your city by ZIP code or by your device’s location, that is used once to
          find a city and state and is not kept. There is no advertising in the app, and nothing
          about how you use it goes to anyone outside the club: administrators see counts, such as
          how many members opened the app this week, never who.
        </P>
        <P>
          The sign-in screen and Me show Google’s sign-in button, which is loaded from Google, so
          Google can see that the page was opened, under{' '}
          <a
            href="https://policies.google.com/privacy"
            className="font-semibold text-emphasis underline"
          >
            Google’s Privacy Policy
          </a>
          . No other part of the app loads anything from Google.
        </P>
      </Section>

      <Section title="How we use it">
        <List>
          <li>
            To sign you in, with your email and password, Google, Apple or a passkey, and to check
            that you were invited.
          </li>
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
            live and what you have chosen to share. They never see your email address, your phone
            number or your birthday; your age is worked out from your birthday on our side. You can
            hide yourself from Peers, on Me.
          </li>
          <li>
            <b>Mentors and administrators from member organizations</b>, such as hospitals and peer
            support programs, see the same profile inside the app, to help match members with peers
            and mentors. They do not see your email address or phone number in the app; a host
            receives them only as described under Event hosts, below.
          </li>
          <li>
            <b>Your email address and phone number</b> are shown only to the club’s administrators
            and, for the address, to whoever invited you, who already had it. Outside the club they
            go only to the host of an event you choose Going for (see Event hosts) and to the
            service providers that run the club.
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
            <b>What Google or Apple sends us</b> is used only to sign you in. It is not shown to
            other members or to organizations, and it is never shared. Unlink either on Me and it is
            no longer used to sign you in.
          </li>
          <li>
            <b>Photographs</b> are only shown to people signed in to the club. Nobody outside it can
            open them, even with a copied link.
          </li>
        </List>
      </Section>

      {/* The owner's practice, 2026-10-08 (email added 2026-10-10): hosts
          receive the contact details of the members going to their event. The Going button says so before it is
          pressed (GOING_SHARES_CONTACT in events/event-card.tsx); keep the two
          in step. */}
      <Section title="Event hosts">
        <P>
          When you choose <b>Going</b> for an event, the organization hosting it receives your email
          address, and your phone number if you have added one, for that event only: to tell you
          about changes, to remind you, and to look after the people who come. Choosing Interested
          shares nothing. Hosts agree not to use your details for marketing, fundraising or
          promotions, and not to pass them on. The Going button says this before you press it.
        </P>
      </Section>

      <Section title="Grant applications">
        <P>
          If you ask Able Bodied Inc. to help you apply for a grant, such as for equipment or
          adaptive sport, we may share what is on your profile with the grant-maker, only for that
          application and only because you asked. This never includes your email address or your
          phone number.
        </P>
      </Section>

      <Section title="Emails">
        <P>
          We email you only to run your account: the link that confirms your address, a link to
          reset or change your password, and the invitation link if somebody invites you. Invitation
          links are sent by the club on behalf of the member or organization that invited you. We do
          not send newsletters or promotions.
        </P>
        <P>
          <b>
            We do not sell or share your email address or phone number with third parties for
            marketing or promotional purposes.
          </b>{' '}
          They reach the service providers that send the emails and run the app (see Service
          providers, below) and, if you choose Going for an event, that event’s host, for that event
          only (see Event hosts).
        </P>
        <P>
          The{' '}
          <Link to="/terms" className="font-semibold text-emphasis underline">
            Terms of Service
          </Link>{' '}
          say more about membership.
        </P>
      </Section>

      {/* Kinds of provider, not their names (the owner, 2026-10-03). The
          kinds are what California's CalOPPA asks a policy to list. */}
      <Section title="Service providers">
        <P>
          We do not sell your information or share it for advertising. We share it only with the
          service providers that run the club for us: hosting, our database and sign-in, email
          delivery, location lookup, device notifications, and Google or Apple, if you sign in with
          them. They receive only what they need to do that work.
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
          That erases your name, username, email address, phone number, photograph, birthday,
          injury, any Google or Apple account you linked, and everything you answered about
          yourself, and takes your address off the invite list. What you wrote in Chat stays, so
          other people’s conversations still make sense, but it says “Deleted member” instead of
          your name. The other person in a one-to-one conversation can then delete it, with
          everything both of you wrote and every photograph in it. A report keeps its copy of the
          reported words, with nobody named.
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
