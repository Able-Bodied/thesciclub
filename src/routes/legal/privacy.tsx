import { Link } from 'react-router-dom';
import {
  ContactEmail,
  LegalPage,
  List,
  Note,
  OutsideLink,
  P,
  Section,
} from '@/routes/legal/legal-page';

/**
 * The Privacy Policy, at /privacy.
 *
 * Says what the code does, and nothing it does not: change one and change the
 * other. Stats naming members goes here in the same change (the owner).
 * Event hosts must stay in step with GOING_SHARES_CONTACT.
 *
 * Text-message sign-in was taken out 2026-10-21; its section, with the
 * carriers' wording, is at d4f26ef:src/routes/legal/privacy.tsx.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 21, 2026">
      <Note title="What changed on October 21, 2026">
        <List>
          <li>
            <b>Who runs the club.</b> The SCI Club is now operated by Alfred Shaheen, no longer by
            Able Bodied Inc. Questions go to <ContactEmail />.
          </li>
          <li>
            <b>Added:</b> link previews, YouTube videos, looking up where you live, photographs,
            notifications, blocking, what administrators can see, how long we keep things, and
            deleting your account by email.
          </li>
          <li>
            <b>Removed:</b> signing in by text message, which the club does not offer.
          </li>
        </List>
      </Note>

      <Section title="Who we are">
        <P>
          The SCI Club is a private, invite-only community for adults living with spinal cord
          injury. It is operated by Alfred Shaheen (“we”, “us”). This policy covers The SCI Club app
          and website, and the emails they send.
        </P>
        <P>
          <b>
            We do not sell your information. There is no advertising in the club, and we do not
            track you across other apps or websites.
          </b>
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
            <b>About your injury or condition:</b> which describes you best, its level, whether it
            is complete, when it began and how, as far as you choose to say. This is health
            information.
          </li>
          <li>
            <b>What you choose to answer</b> in the profile questions, such as your languages,
            interests, work, education and family, the self-care devices and procedures you use
            (catheters, for example), and the topics you want to talk about. Every one of them can
            be left out.
          </li>
          <li>
            <b>What you do in the club:</b> your messages, posts and photographs, the events you
            reply to, the organizations you follow, the posts you like, react to or save, the posts
            you have read, in a room or on Home, and anything you report or anyone you block.
          </li>
          <li>
            <b>Your answers while you join:</b> what you have answered so far and the step you are
            on, so you can pick up where you left off, on this device or another. We also note which
            steps you reached; administrators see only how many people reached each step, never who.
          </li>
          <li>
            <b>Whether you read a post on a phone or tablet, or on a computer</b>, from October 20,
            2026, worked out from what your browser says about itself.
          </li>
          <li>
            <b>If you turn notifications on</b> for a device: an address for that device, given by
            its notification service, and the kind of browser or device it is.
          </li>
          <li>
            <b>If you sign in with Google or Apple:</b> the name, email address and account number
            they send us. If you use Apple’s Hide My Email, the address we hold is the one Apple
            makes for us.
          </li>
          <li>
            <b>How you sign in:</b> whether you joined with email, Google or Apple, and when and
            which way you sign in, and whether it was in the app added to your Home Screen.
          </li>
          <li>
            <b>If you add a passkey:</b> a public key and the name of the device it is on. Your
            fingerprint or face never leaves your device.
          </li>
          <li>
            <b>If you invite somebody:</b> the email address you give us, which goes on the club’s
            list, and we email them a link.
          </li>
        </List>
        <P>
          Like any website, the services that run the club see your device’s internet (IP) address
          when it connects, and our sign-in service keeps it, with the kind of browser, for each
          signed-in session, to keep accounts secure. On your device, the app keeps you signed in
          and remembers settings such as text size. It uses no cookies or tools for advertising or
          analytics.
        </P>
      </Section>

      <Section title="Your phone’s camera, photos and location">
        <List>
          <li>
            <b>Camera and photos:</b> only when you choose to add a photograph, to your profile, a
            post or a message. We receive only the picture you pick.
          </li>
          <li>
            <b>Location:</b> only if you ask for it, while joining, on the step that asks where you
            live. You can type a ZIP code, or press <b>Use my location</b>, which your device asks
            you to allow. We send the ZIP code, or your device’s position, to OpenStreetMap’s
            Nominatim service, which answers with a city and state. Neither the ZIP code nor the
            position is kept. Or skip both and choose your state and city yourself.
          </li>
          <li>
            <b>Events near you:</b> to show events within a distance of home, a nightly job looks up
            the middle of each city members live in, also with OpenStreetMap. It sends only the city
            and state, never who lives there.
          </li>
        </List>
        <P>
          OpenStreetMap’s own policy is the{' '}
          <OutsideLink href="https://osmfoundation.org/wiki/Privacy_Policy">
            OSMF Privacy Policy
          </OutsideLink>
          .
        </P>
      </Section>

      <Section title="Links and videos">
        <P>
          When a message or a post has a link in it, the club’s own server visits that page once, to
          show its title and picture under the link, and keeps a copy of the picture. So your phone
          contacts nobody when you read it: the site learns only that the club visited, not who
          posted the link or who read it. Opening the link takes you to that site, under its own
          policy.
        </P>
        <P>
          A YouTube video plays in place, from YouTube’s privacy-enhanced player. YouTube receives
          anything only when you press play, and then under{' '}
          <OutsideLink href="https://policies.google.com/privacy">
            Google’s Privacy Policy
          </OutsideLink>
          .
        </P>
      </Section>

      <Section title="Notifications">
        <P>
          Notifications are off until you turn them on, and you can choose which kinds you get on Me
          → Settings. They reach your device through its notification service: Apple’s on an iPhone,
          iPad or Mac, Google’s on Android or in Chrome, or your browser maker’s. A notification can
          show the first words of a message on your lock screen.
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
          <li>
            To keep the club safe: looking into reports and blocks, and closing an account if
            needed.
          </li>
        </List>
        <P>
          We never use your injury, your health or anything else about you for advertising, and
          never sell it.
        </P>
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
            <b>Members see some of what you do:</b> who likes or reacts to a post, who is going to
            an event, and, in a conversation you are in, that you have read a message. A post shows
            how many people have read it, never who.
          </li>
          <li>
            <b>Members who speak for organizations</b>, such as hospitals and peer support programs,
            see the same profile inside the app as anybody else, to help match members with peers
            and mentors. They do not see your email address or phone number in the app; a host
            receives them only as described under Event hosts, below.
          </li>
          <li>
            <b>Your email address</b> is also seen by whoever invited you, who already had it.
          </li>
          <li>
            <b>Direct and group conversations</b> cannot be read by administrators. If somebody
            reports a single message or post, that one message is shown to administrators, with who
            wrote it and when, and nothing else from the conversation.
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

      <Section title="What administrators can see">
        <P>The club’s administrators look after it. To do that, they can see:</P>
        <List>
          <li>every member’s email address and phone number;</li>
          <li>
            reports: the one reported message or post, a copy of its words, who wrote it, when, and
            who reported it;
          </li>
          <li>blocks: who blocked whom, with no words, and a weekly count;</li>
          <li>
            when you change a post or a message, the earlier wording, which nobody else can read,
            you included;
          </li>
          <li>who is going to each event, to pass on to its host (see Event hosts);</li>
          <li>
            in <b>Admin → Stats</b>: counts, such as how many members opened the app this week,
            never who; and, naming members, how each member signs in, whether each has notifications
            on and on how many devices, and who has read each post and when, including reads from
            before October 20, 2026, with whether each read was on a phone or tablet, or a computer.
          </li>
        </List>
      </Section>

      {/* The owner's practice, 2026-10-08 (email added 2026-10-10). Keep in
          step with GOING_SHARES_CONTACT in events/event-card.tsx. */}
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
          If you ask us to help you apply for a grant, such as for equipment or adaptive sport, we
          may share what is on your profile with the grant-maker, only for that application and only
          because you asked. This never includes your email address or your phone number.
        </P>
      </Section>

      <Section title="Emails">
        <P>
          We email you only to run your account: the link that confirms your address, a link to
          reset or change your password, a notice when your password changes, and the invitation
          link if somebody invites you. Invitation links are sent by the club on behalf of the
          member or organization that invited you. We do not send newsletters or promotions.
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

      <Section title="Service providers">
        <P>
          We share your information only with the service providers that run the club for us, and
          they receive only what they need to do that work:
        </P>
        <List>
          <li>hosting, our database, file storage and sign-in;</li>
          <li>email delivery;</li>
          <li>running the nightly job that imports events;</li>
          <li>location lookup (OpenStreetMap);</li>
          <li>device notifications (Apple, Google, or your browser’s maker);</li>
          <li>Google or Apple, if you sign in with them.</li>
        </List>
        <P>
          Screens that offer Google sign-in load Google’s button from Google, so Google can see that
          the page was opened, under{' '}
          <OutsideLink href="https://policies.google.com/privacy">
            Google’s Privacy Policy
          </OutsideLink>
          . No other part of the app loads anything from Google.
        </P>
      </Section>

      <Section title="How long we keep it">
        <List>
          <li>
            <b>Your account and profile:</b> until you delete your account, or an administrator
            removes it.
          </li>
          <li>
            <b>Your answers while you join:</b> deleted once you finish joining, or after 90 days if
            you do not.
          </li>
          <li>
            <b>Your notifications list:</b> 30 days.
          </li>
          <li>
            <b>A ZIP code or position</b> used to find your city: not kept at all.
          </li>
          <li>
            <b>What you write in Chat:</b> until it is deleted. After your account is deleted it
            stays, as below.
          </li>
          <li>
            <b>Reports:</b> kept, with their copy of the reported words, even after the message is
            deleted.
          </li>
          <li>
            <b>Blocks:</b> until you unblock. The administrators’ record that it happened stays.
          </li>
          <li>
            <b>An invited email address:</b> on the list until the invite is used or withdrawn.
          </li>
        </List>
      </Section>

      <Section title="Adults only">
        <P>
          The SCI Club is for people 18 and over. We do not knowingly collect information from
          anybody younger, and the app does not let anybody under 18 join.
        </P>
      </Section>

      <Section title="Deleting your account">
        <P>
          You can delete your account yourself, from <b>Me → Account → Delete my account</b>. That
          erases your name, username, email address, phone number, photograph, birthday, injury, any
          Google or Apple account you linked, everything you answered about yourself, and your
          likes, reactions, saves, follows, replies to events, blocks and notifications, and takes
          your address off the invite list.
        </P>
        <P>
          What you wrote in Chat, and the photographs you shared there, stay, so other people’s
          conversations still make sense, but they say “Deleted member” instead of your name. The
          other person in a one-to-one conversation can then delete it, with everything both of you
          wrote and every photograph in it. A report keeps its copy of the reported words, with
          nobody named. Details already passed to an event’s host stay with that host.
        </P>
        <P>
          If you cannot sign in, or are an administrator, email <ContactEmail /> to ask us to delete
          your account, or for a copy of what we hold about you. Write from the address on your
          account if you can. You can also correct anything about you on Me.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          If this policy changes, the date at the top changes, and the top of the page says what
          changed.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Questions about this policy or your information: <ContactEmail />. The SCI Club, operated
          by Alfred Shaheen.
        </P>
      </Section>
    </LegalPage>
  );
}
