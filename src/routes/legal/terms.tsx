import { Link } from 'react-router-dom';
import { ContactEmail, LegalPage, List, P, Section } from '@/routes/legal/legal-page';

/**
 * The Terms of Service, at /terms.
 *
 * The club's full terms, at the owner's word (2026-10-01): membership and the
 * four ways to lose it. The four are the ones CONTEXT.md has always held, which
 * said they would go "in the terms of service when there is one to link to".
 * This is it.
 *
 * The text-message terms went on 2026-10-11 with phone sign-in
 * (EMAIL-SIGN-IN-PLAN.md): the club sends no texts, so there is no SMS program
 * to describe. "Email" says what it does send.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 11, 2026">
      <Section title="The club">
        <P>
          The SCI Club is a private community for adults living with spinal cord injury, run by Able
          Bodied Inc., a nonprofit organization. By joining or using it you agree to these terms and
          to the{' '}
          <Link to="/privacy" className="font-semibold text-emphasis underline">
            Privacy Policy
          </Link>
          .
        </P>
      </Section>

      <Section title="Membership">
        <List>
          <li>
            <b>Invite only.</b> A member organization or a mentor puts your email address on the
            club’s list, and the club emails you a link, before you can join. The app cannot let you
            in by itself.
          </li>
          <li>
            <b>Adults only.</b> You must be 18 or over.
          </li>
        </List>
      </Section>

      <Section title="Losing your membership">
        <P>Membership can be taken away. Any of these will end it:</P>
        <List>
          <li>Selling to members.</li>
          <li>Harassing anyone.</li>
          <li>Giving medical advice as fact.</li>
          <li>Repeating outside a room what was said in it.</li>
        </List>
        <P>
          Any member can report a message or a post that breaks these. Administrators see only the
          reported message, and the person reported is not told.
        </P>
      </Section>

      <Section title="What you write">
        <P>
          What you write is yours. Members cannot rename or delete a room once it is started;
          administrators can close a room, and can remove a post or a topic that should not be
          there. If you delete your account, what you wrote in Chat stays and says “Deleted member”
          instead of your name, until the other person in a one-to-one conversation deletes it.
        </P>
      </Section>

      <Section title="Email">
        <P>
          <b>What the club emails you.</b> Able Bodied Inc. emails you to run your account: the link
          that confirms your address, a link to reset or change your password, and an invitation
          link when somebody invites you. It does not send newsletters or promotions. Questions or
          trouble getting an email: <ContactEmail />.
        </P>
        <P>
          <b>A phone number is optional.</b> If you add one, it is only so the host of an event you
          choose Going for can reach you about that event. It is never used to sign you in. How we
          handle it is in the{' '}
          <Link to="/privacy" className="font-semibold text-emphasis underline">
            Privacy Policy
          </Link>
          .
        </P>
      </Section>

      <Section title="Leaving">
        <P>
          You can delete your account at any time from <b>Delete my account</b> at the foot of Me.
          The Privacy Policy says what that erases and what stays.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          <ContactEmail />, or Able Bodied Inc., 1968 S. Coast Hwy #3742, Laguna Beach, CA 92651.
        </P>
      </Section>
    </LegalPage>
  );
}
