import { FileText, KeyRound, ListOrdered, MessagesSquare, ScanSearch, Search, TrendingUp } from 'lucide-react';
export const STEPS = [
  { n: 1, key: 'login', title: 'Signed in', hint: 'Account and profile', icon: KeyRound },
  { n: 2, key: 'jd', title: 'Job description', hint: 'What the role needs', icon: FileText },
  { n: 3, key: 'cvs', title: 'Upload CVs', hint: 'Parse in parallel', icon: ScanSearch },
  { n: 4, key: 'rank', title: 'Stack ranking', hint: 'Evidence-based scores', icon: ListOrdered },
  { n: 5, key: 'questions', title: 'Screening questions', hint: 'Call script', icon: MessagesSquare },
  { n: 6, key: 'market', title: 'Hiring market', hint: 'Live web search', icon: TrendingUp },
  { n: 7, key: 'search', title: 'Search strings', hint: 'LinkedIn and Naukri', icon: Search },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];
