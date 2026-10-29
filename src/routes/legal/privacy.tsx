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
    <LegalPage title="Privacy Policy" updated="October 28, 2026">
      <Note title="What changed on October 28, 2026">
        <List>
          <li>
            <b>Added:</b> address suggestions. When an administrator or an organization account
            types a location’s street address, what they type goes to Komoot’s Photon service to
            suggest matching addresses. Members’ information is never sent.
          </li>
          <li>
            <b>Changed:</b> a reaction to your post or message now tells you who reacted, in a
            notification, as a like already did. The app’s icon shows how many kinds of notification
            you have not opened yet, instead of unread conversations.
          </li>
          <li>
            <b>Changed:</b> on the map, a place with one member shows that member’s photograph and
            name, as Peers does.
          </li>
          <li>
            <b>Changed:</b> the ZIP code you give is now kept, and only you can see it. On the map
            you are counted at the middle of your ZIP code instead of your city’s; other members
            never see the ZIP code itself, but if you are the only member there, your photograph and
            name show at its middle, so they can tell roughly which part of town you live in. Leave
            the ZIP code out, in Your details, to be counted by city only.
          </li>
          <li>
            <b>Added:</b> asking for an invite. Somebody without one can send an organization’s org
            admins their name, email address and a note. The page that offers this shows each org
            admin’s first name to anyone who opens it.
          </li>
          <li>
            <b>Changed:</b> an org admin’s QR code or invite link lets in whoever uses it before it
            expires, and its maker is told who joined.
          </li>
          <li>
            <b>Added:</b> a link to a post can be shared outside the club. It carries none of the
            post’s words; only members can read the post. The confirmation email now has a code to
            type in the app, as well as its link.
          </li>
          <li>
            <b>Added:</b> that the club is not covered by HIPAA, how we keep your information safe
            and what we do if it is ever exposed, when the law can require us to share it, your
            privacy rights wherever you live in the US, and where your information is kept.
          </li>
          <li>
            <b>Added:</b> mentions. Typing @ and a member’s username in a post or reply tells them
            who mentioned them, in a notification, and links to their profile.
          </li>
        </List>
      </Note>
      <Note title="What changed on October 26, 2026">
        <List>
          <li>
            <b>Added:</b> the map. Members are counted at the middle of their city, never closer;
            Show me on the map, on Me, leaves you out. Use my location on the map stays on your
            device. Map pictures come from the club’s own copy of OpenStreetMap, served by
            Cloudflare. Event and organization addresses are looked up with OpenStreetMap.
          </li>
        </List>
      </Note>
      <Note title="What changed on October 25, 2026">
        <List>
          <li>
            <b>Added:</b> the iPhone app, link previews, YouTube videos, your Google photo, Sign in
            with Apple, looking up where you live, photographs, notifications, public event pages
            and their guest lists, adding events by calendar invitation, blocking, reporting a
            profile, what administrators can see, how long we keep things, and deleting your account
            by email.
          </li>
          <li>
            <b>Removed:</b> signing in by text message, which the club does not offer.
          </li>
        </List>
      </Note>

      <Section title="Who we are">
        <P>
          The SCI Club is a private, invite-only community for adults living with spinal cord injury
          and their family members. It is operated by Alfred Shaheen (“we”, “us”). This policy
          covers The SCI Club app and website, and the emails they send.
        </P>
        <P>
          <b>
            We do not sell your information. There is no advertising in the club, and we do not
            track you across other apps or websites.
          </b>
        </P>
        <P>
          The club is not a doctor, hospital or health plan, so HIPAA, the US health privacy law,
          does not cover what you tell it. This policy does: the health information you share is
          used only as it says.
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
            city and state, your ZIP code if you give one, and a photograph with its description if
            you add one.
          </li>
          <li>
            <b>A phone number, only if you add one</b>, for the hosts of events you choose Going
            for. It is never used to sign you in.
          </li>
          <li>
            <b>About your injury or condition:</b> which describes you best (or that you are a
            relative or spouse), its level, whether it is complete, when it began and how, as far as
            you choose to say. This is health information.
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
            <b>If you register for an event on its public page:</b> your name, your email address,
            your phone number if you give one, and whether you are going or interested, whether or
            not you have an account.
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
            <b>Your Google photo, only if you choose it.</b> Signed in with Google, the photo step
            and Your details offer your Google profile photo. Your device fetches it from Google to
            show you; it is copied to the club only if you press <b>Use my Google photo</b>.
          </li>
          <li>
            <b>If you sign in with Apple:</b> a token from Apple, kept only so we can ask Apple to
            end the club’s Sign in with Apple when you unlink Apple or delete your account. Apple
            may also tell us that you stopped using Sign in with Apple with the club, deleted your
            Apple Account, or turned Hide My Email forwarding off or on. Administrators are shown
            that, so they can help you keep a way to sign in.
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
            list, and we email them a link. You can withdraw the invite until it is used.
          </li>
          <li>
            <b>If you ask for an invite</b>, before you are a member: your name, your email address,
            a note if you write one, and which organization you asked.
          </li>
          <li>
            <b>If you add an event by calendar invitation</b> (members who speak for an
            organization, and administrators): the address it came from, and what it says about the
            event: title, time, place, link and description. Its other guests are never kept. An
            invitation from anybody else is ignored, and the club keeps nothing from it.
          </li>
        </List>
        <P>
          Like any website, the services that run the club see your device’s internet (IP) address
          when it connects, and our sign-in service keeps it, with the kind of browser, for each
          signed-in session and in a log of sign-ins, to keep accounts secure. On your device, the
          app keeps you signed in and remembers settings such as text size, and, if you open a link
          to a post before you are signed in, which post, for 30 days, so it can take you there once
          you are. It uses no cookies or tools for advertising or analytics.
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
            Nominatim service, which answers with a city and state. The position is not kept. The
            ZIP code is kept, and only you can see it: the map counts you at its middle. Or skip
            both and choose your state and city yourself.
          </li>
          <li>
            <b>On the map:</b> <b>Use my location</b> asks your device only when you press it, and
            only for your approximate position. It is used on your device to show where you are, and
            is never sent to the club or kept.
          </li>
          <li>
            <b>Events near you:</b> to show events within a distance of home, and to place members
            on the map, a nightly job looks up the middle of each city and ZIP code members live in,
            also with OpenStreetMap. It sends only the city and state, or the ZIP code, never who
            lives there.
          </li>
          <li>
            <b>Event and organization addresses</b> are looked up with OpenStreetMap when they are
            saved, so they can be placed on the map. Only the address is sent.
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
          . In the iPhone app, the player is loaded through a page of the club’s website,
          thesciclub.com/embed/, because YouTube will not play inside the app itself. YouTube then
          receives what it would from its player on any website.
        </P>
      </Section>

      <Section title="Notifications">
        <P>
          Notifications are off until you turn them on, and you can choose which kinds you get on Me
          → Settings. They reach your device through its notification service: Apple’s on an iPhone,
          iPad or Mac, Google’s on Android or in Chrome, or your browser maker’s. A notification can
          show the first words of a message on your lock screen.
        </P>
        <P>
          In the iPhone app, notifications go through Apple Push Notification service, and the
          address we keep is a token for your iPhone. On the website, a notification’s words are
          encrypted so that only your device can read them; in the app they are not, so Apple could
          read them on the way. Once notifications are on, the app’s icon shows how many kinds of
          notification you have not opened yet, such as messages or replies; opening one, or your
          notifications list, clears it.
        </P>
        {/* 20261028980000. */}
        <P>
          For an event you said you are going to, you are also reminded ten minutes before it
          starts, if that kind of notification is on, and we email you the day before: its name,
          when and where it is, and a link to it. The email goes to your account’s address through
          our email provider. You can switch these emails off on Me → Settings.
        </P>
        {/* 20261029070000. */}
        <P>
          When a member mentions your username in a post, you are told who, with the start of the
          post, once for each post. Not by somebody you blocked or who blocked you, and only in a
          room you can read. Mentions in conversations notify nobody.
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
            <b>On the map</b>, other members see how many members live in each place, shown at the
            middle of your ZIP code if you gave one, or of your city, never your address or anything
            closer. A place with one member shows that member’s photograph and name, as Peers does,
            so others can tell roughly which part of town they live in. To be counted by city only,
            leave your ZIP code out. Turn off <b>Show me on the map</b>, on Me, to be left out;
            hiding yourself from Peers leaves you off the map too.
          </li>
          <li>
            <b>Members see some of what you do:</b> who likes or reacts to a post, who is going to
            an event, and, in a conversation you are in, that you have read a message. Liking or
            reacting to a post or a message tells its author who you are, in a notification, and so
            does mentioning a member in a post. A post shows how many people have read it, never
            who.
          </li>
          <li>
            <b>Members who speak for organizations</b>, such as hospitals and peer support programs,
            see the same profile inside the app as anybody else, to help match members with peers
            and mentors. They see your email address and phone number only on the guest list of an
            event they manage, and only if you chose Going (see Event hosts, below).
          </li>
          <li>
            <b>Your email address</b> is also seen by whoever invited you, who already had it. If
            you join with a QR code or invite link, whoever made it is told that you joined, and
            sees your profile like any member.
          </li>
          <li>
            <b>If you ask for an invite</b>, what you send is seen by the org admins of the
            organization you chose, and nobody else. The page where you ask shows the first name of
            each organization’s org admins, to anyone who opens it.
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
            who reported it; or a copy of a reported profile as it was then (name, @username,
            photograph and what the member wrote), and who reported it;
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
          step with GOING_SHARES_CONTACT in components/rsvp-sheet.tsx. */}
      <Section title="Event hosts">
        <P>
          When you choose <b>Going</b> for an event, the organization hosting it receives your email
          address, and your phone number if you have added one, for that event only: to tell you
          about changes, to remind you, and to look after the people who come. Choosing Interested
          shares nothing. Hosts agree not to use your details for marketing, fundraising or
          promotions, and not to pass them on. Choosing Going says this, and offers Interested
          instead. Anybody in the club who manages the event sees them on its guest list; for other
          hosts, an administrator passes them on.
        </P>
        {/* Public event pages and registrations, 2026-10-22 (20261022190000). */}
        <P>
          An event can have a public page that anyone with its link can open. It shows the event's
          details only, never who is going or how many. Adding yourself to the club’s list there
          shares your name, email address and phone number, if you give it, with the club’s
          administrators and anybody in the club who manages that event, for that event only. It
          does not register you with the host. The guest list also says whether the address belongs
          to a member, or to somebody joining. If you then sign in or join with that address, it
          becomes your Going or Interested, and the paragraph above applies.
        </P>
      </Section>

      <Section title="Grants">
        <P>
          The club lists grants that organizations offer, such as for equipment or adaptive sport,
          and when to apply, with a link to each one. We do not help with applications or apply for
          you, and we share nothing about you with grant-makers. You apply on the organization’s own
          site, under its own policy.
        </P>
      </Section>

      <Section title="Emails">
        <P>
          We email you only to run your account: the code and link that confirm your address, a link
          to reset or change your password, a notice when your password changes, and the invitation
          link if somebody invites you. Invitation links are sent by the club on behalf of the
          member or organization that invited you. If you add an event by calendar invitation, we
          email you what became of it, and when it waits for approval we email whoever may approve
          it, with your address. We also email you the day before an event you are going to, unless
          you switch that off (see Notifications). We do not send newsletters or promotions.
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
          Apart from what members, hosts and organizations see as this policy describes, we share
          your information only with the service providers that run the club for us, and they
          receive only what they need to do that work:
        </P>
        <List>
          <li>hosting, our database, file storage and sign-in;</li>
          <li>sending email, and receiving calendar invitations and the email you send us;</li>
          <li>running the nightly job that imports events;</li>
          <li>location lookup (OpenStreetMap);</li>
          <li>
            address suggestions (Komoot’s Photon service, which searches OpenStreetMap): when an
            administrator or an organization account types a location’s street address, what they
            type is sent to Photon to suggest matching addresses. Members’ information is never sent
            to it;
          </li>
          <li>
            map pictures (Cloudflare, which stores and serves the club’s own copy of OpenStreetMap’s
            map; like any web host, it sees your device’s internet address and which parts of the
            map it loads);
          </li>
          <li>device notifications (Apple, Google, or your browser’s maker);</li>
          <li>Google or Apple, if you sign in with them.</li>
        </List>
        <P>
          On the website, screens that offer Google sign-in load Google’s button from Google, so
          Google can see that the page was opened, under{' '}
          <OutsideLink href="https://policies.google.com/privacy">
            Google’s Privacy Policy
          </OutsideLink>
          . In the iPhone app, Google is contacted only when you press its button. Apart from that,
          a YouTube video you play and your Google photo, nothing in the club loads anything from
          Google.
        </P>
      </Section>

      <Section title="When the law asks">
        <P>
          We would share information about you outside the club only if the law requires it, such as
          a court order, or to protect somebody from serious harm. If we are allowed to, we tell you
          first.
        </P>
      </Section>

      <Section title="Keeping it safe">
        <P>
          Everything between your device and the club is encrypted on the way. Passwords are kept
          only in scrambled form, photographs open only for people signed in, and the database
          itself checks who may read each thing, so a member sees only what this policy says they
          can.
        </P>
        <P>
          No system is perfectly secure. If we learn that your information has been exposed, we will
          tell you, and the authorities where the law requires, with what happened and what you can
          do. If you think somebody else has used your account, change your password and email{' '}
          <ContactEmail />.
        </P>
      </Section>

      <Section title="Your rights">
        <P>
          Wherever you live, you can see and correct most of what we hold about you on Me, ask us
          for a copy of all of it, and ask us to correct or delete it. It costs nothing. Email{' '}
          <ContactEmail />, from the address on your account if you can; we may write back to that
          address to check it is you before we act, and we reply when it is done.
        </P>
        <P>
          California and other US states give their residents rights to know what is collected, to
          correct and delete it, and to opt out of its sale, of its sharing for advertising, and of
          decisions made about them by a computer alone. We do not sell your information or share it
          for advertising, and no decision about you is made by a computer alone, so there is
          nothing to opt out of. We will not treat you differently for asking about your
          information. The club does not track you across other sites, so a browser’s Do Not Track
          or Global Privacy Control setting has nothing to stop here.
        </P>
      </Section>

      <Section title="Where it is kept">
        <P>
          The club is run from the United States. Its service providers may store or handle your
          information in the United States or in other countries where they work.
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
            <b>A registration from an event's public page:</b> 90 days after the event.
          </li>
          <li>
            <b>Your notifications list:</b> 30 days.
          </li>
          <li>
            <b>Apple’s token:</b> until you unlink Apple or delete your account, and then until
            Apple confirms the link is ended.
          </li>
          <li>
            <b>A calendar invitation:</b> kept with the address it came from, as the record of where
            its event came from, after the event too.
          </li>
          <li>
            <b>Your ZIP code:</b> until you change or remove it in Your details, or your account is
            deleted. <b>A position</b> used to find your city: not kept at all.
          </li>
          <li>
            <b>What you write in Chat:</b> until it is deleted. After your account is deleted it
            stays, as below.
          </li>
          <li>
            <b>Reports:</b> kept, with their copy of the reported words, even after the message is
            deleted or the profile is changed. Once the reported member’s account is deleted, a
            report of their profile keeps only what they wrote: their name, @username and photograph
            go.
          </li>
          <li>
            <b>Blocks:</b> until you unblock. The administrators’ record that it happened stays.
          </li>
          <li>
            <b>Sign-in records</b>, with their email and IP addresses: until your account is
            deleted.
          </li>
          <li>
            <b>A request for an invite:</b> 90 days after an org admin answers it, or 90 days after
            it was sent if nobody does.
          </li>
          <li>
            <b>An invited email address:</b> invites do not expire, so it stays on the list until
            the invite is used, or withdrawn by whoever sent it or an administrator. A withdrawn
            invite keeps its record of who invited the address.
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
          likes, reactions, saves, follows, replies to events, blocks and notifications, and your
          sign-in records with their email and IP addresses, and takes your address off the invite
          list. If you signed in with Apple, we also ask Apple to end the club’s Sign in with Apple.
        </P>
        <P>
          What you wrote in Chat, and the photographs you shared there, stay, so other people’s
          conversations still make sense, but they say “Deleted member” instead of your name. The
          other person in a one-to-one conversation can then delete it, with everything both of you
          wrote and every photograph in it. A report keeps its copy of the reported words, with
          nobody named. A report of your profile keeps what you wrote on it, but your name,
          @username and photograph go from it. Details already passed to an event’s host stay with
          that host. A registration on an event’s public page stays until 90 days after the event,
          and a calendar invitation you sent keeps the address it came from.
        </P>
        <P>
          If you cannot sign in, or are an administrator, email <ContactEmail /> to ask us to delete
          your account, or for a copy of what we hold about you. Write from the address on your
          account if you can. We delete it by hand and reply when it is done. You can also correct
          anything about you on Me.{' '}
          <Link to="/delete-account" className="font-semibold text-emphasis underline">
            Deleting your account
          </Link>{' '}
          has the steps.
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
