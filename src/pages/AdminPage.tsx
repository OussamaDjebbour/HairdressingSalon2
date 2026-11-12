import { Schedule } from '../components/Schedule';
import { AdminShell } from '../components/admin/AdminShell';

export function AdminPage() {
  return <AdminShell>{(userId) => <Schedule userId={userId} />}</AdminShell>;
}
