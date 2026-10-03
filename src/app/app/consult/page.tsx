import { StartConsultationForm } from '@/components/StartConsultationForm';
import { Card } from '@/components/ui';

export const metadata = { title: 'Check a symptom · MediSense' };

export default function StartConsultationPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Check a symptom</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
        Choose the symptoms you are experiencing or describe them in your own words, then answer a
        short set of questions. You will get a written summary and clear advice on how soon to be seen.
      </p>

      <div className="mt-8 space-y-6">
        <Card className="p-6">
          <StartConsultationForm />
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-ink-900">Before you start</h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-600">
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              This checks for warning signs and summarises what you describe. It does not diagnose you
              and it does not tell you what treatment to take.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              If you are already seriously unwell, do not wait for this. Contact a clinician or your
              local emergency number.
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              Answering "no" to a warning-sign question is a screening answer, not proof that the
              problem is not there. A clinician may still need to examine you.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
