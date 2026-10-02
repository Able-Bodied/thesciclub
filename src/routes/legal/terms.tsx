import { Link } from 'react-router-dom';
import { ContactEmail, LegalPage, List, P, Section } from '@/routes/legal/legal-page';

/**
 * The Terms of Service, at /terms.
 *
 * The club's full terms, at the owner's word (2026-10-01): membership, the
 * four ways to lose it, and the text-message terms the carriers' registration
 * links to. The four are the ones CONTEXT.md has always held, which said they
 * would go "in the terms of service when there is one to link to". This is it.
 *
 * "Text messages" carries what carriers ask of SMS terms: the program name,
 * what the texts are, how often, "Message and data rates may apply", support,
 * HELP and STOP in bold, the privacy link, and the carriers' liability line.
 * It has to say what the registration says: keep the two in step.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 1, 2026">
      <Section title="The club">
        <P>
          The SCI Club is a private community for adults living with spinal cord injury, run by Able
          Bodied Inc., a nonprofit organization. By joining or using it you agree to these terms and
          to the{' '}
          <Link to="/privacy" className="font-semibold text-navy underline">
            Privacy Policy
          </Link>
          .
        </P>
      </Section>

      <Section title="Membership">
        <List>
          <li>
            <b>Invite only.</b> A member organization or a mentor puts your phone number on the
            club’s list before you can join. The app cannot let you in by itself.
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
          there. If you delete your account, what you wrote in Chat stays and says “Deleted user”
          instead of your name.
        </P>
      </Section>

      <Section title="Text messages">
        <P>
          <b>The SCI Club sign-in codes.</b> When you ask for a code to sign in, Able Bodied Inc.
          texts a one-time code to the number you entered. That is the only text the club sends: one
          message each time you ask for a code, and none otherwise. You agree to these texts by
          ticking the box on the sign-in page.
        </P>
        <P>
          <b>Message and data rates may apply.</b>
        </P>
        <P>
          <b>Text HELP</b> to the number the code came from for help, or email <ContactEmail />.
        </P>
        <P>
          <b>Text STOP</b> to stop the texts. You will get one message confirming it, and no more,
          including sign-in codes, so you will not be able to sign in until you <b>text START</b> to
          get them again.
        </P>
        <P>
          Carriers are not liable for delayed or undelivered messages. How we handle your phone
          number is in the{' '}
          <Link to="/privacy" className="font-semibold text-navy underline">
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
