import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/display';
import { ImportForm } from './import-form';

export const metadata: Metadata = { title: 'Import customers' };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import customers"
        description="Bring your existing book across. Duplicates are skipped on phone number."
      />
      <ImportForm />
    </>
  );
}
