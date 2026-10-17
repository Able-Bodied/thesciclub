import { createContext } from 'react';
import type { Account } from '@/lib/account';

/**
 * The account the club's guard read (RequireMember, through AccountProvider
 * in lib/account.tsx). Its own module, importing nothing that runs, so
 * lib/session.tsx can start from it and a test that mocks lib/account does
 * not take it away.
 */
export const AccountContext = createContext<Account | null>(null);
