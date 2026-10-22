import { Link } from 'react-router-dom';
import { ContactEmail, LegalPage, List, P, Section, Steps } from '@/routes/legal/legal-page';

/**
 * Deleting your account, at /delete-account: public, for somebody without
 * the app, as Google Play asks. What it erases is delete_my_account's
 * (20261012000000) and the cascades on members; keep it in step with Privacy.
 */
export default function DeleteAccountPage() {
  return (
    <LegalPage title="Deleting your account" updated="October 21, 2026">
      <P>How to delete your account in The SCI Club, and what that erases.</P>

      <Section title="In the app">
        <Steps>
          <li>Open The SCI Club and sign in.</li>
          <li>
            Go to <b>Me</b>, then the <b>Account</b> tab.
          </li>
          <li>
            Press <b>Delete my account</b>, read what it does, and press <b>Delete my account</b>{' '}
            again.
          </li>
        </Steps>
        <P>It happens at once, and it cannot be undone.</P>
      </Section>

      <Section title="By email">
        <P>
          If you cannot sign in, or no longer have the app, email{' '}
          <ContactEmail subject="Delete my account" /> and ask us to delete your account. Write from
          the address you use for the club if you can, and tell us your name or @username. We delete
          it by hand and reply when it is done. An administrator’s account cannot be deleted in the
          app, so administrators ask this way too.
        </P>
      </Section>

      <Section title="What is erased">
        <List>
          <li>Your name, username, email address, phone number, photograph and birthday.</li>
          <li>Your injury or condition, and everything you answered about yourself.</li>
          <li>Any Google or Apple account you linked.</li>
          <li>Your sign-in records, with the email and IP addresses they hold.</li>
          <li>
            Your likes, reactions, saved posts, followed organizations, replies to events, blocks
            and notifications.
          </li>
          <li>Your address on the invite list, so coming back takes a new invite.</li>
        </List>
      </Section>

      <Section title="What stays">
        <List>
          <li>
            What you wrote in Chat, and the photographs you shared there, so other people’s
            conversations still make sense. It says “Deleted member” instead of your name. The other
            person in a one-to-one conversation can then delete it all.
          </li>
          <li>A report’s copy of the words that were reported, with nobody named.</li>
          <li>Details already passed to the host of an event you were going to.</li>
        </List>
        <P>
          The{' '}
          <Link to="/privacy" className="font-semibold text-emphasis underline">
            Privacy Policy
          </Link>{' '}
          says more about what we keep and for how long.
        </P>
      </Section>
    </LegalPage>
  );
}
