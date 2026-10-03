'use client';

import {
  Activity,
  AudioLines,
  BrainCircuit,
  Check,
  CircleDot,
  Clock3,
  Database,
  HeartPulse,
  Languages,
  MessageCircle,
  Mic2,
  Network,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
  Watch,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  Button,
  LineDraw,
  NumberCard,
  PillBadge,
  Reveal,
  SectionHeader,
  SlideFooter,
} from '@/components/presentation/slide-components';

function HealthCoreVisual() {
  return (
    <figure
      className="health-visual"
      aria-label="Illustration of MediSense health intelligence with a human outline and health signals"
      onPointerMove={(event) => {
        if (window.matchMedia('(pointer: coarse)').matches) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        event.currentTarget.style.setProperty('--tilt-x', `${y * -10}px`);
        event.currentTarget.style.setProperty('--tilt-y', `${x * 10}px`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty('--tilt-x', '0px');
        event.currentTarget.style.setProperty('--tilt-y', '0px');
      }}
    >
      <div className="visual-orbit orbit-one" aria-hidden="true" />
      <div className="visual-ring ring-one" aria-hidden="true" />
      <div className="visual-ring ring-two" aria-hidden="true" />
      <div className="health-core">
        <svg className="body-outline" viewBox="0 0 170 250" fill="none" aria-hidden="true">
          <path
            d="M85 18c-18 0-30 13-30 31 0 14 8 25 17 30-8 8-18 12-32 17-17 7-25 22-27 42l-5 47c-1 11 15 14 19 3l15-38 8 83c1 13 19 14 21 1l9-67 9 67c2 13 20 12 21-1l8-83 15 38c4 11 20 8 19-3l-5-47c-2-20-10-35-27-42-14-5-24-9-32-17 9-5 17-16 17-30 0-18-12-31-30-31Z"
            stroke="#2E7D57"
            strokeWidth="1.8"
          />
          <path d="M85 88v104" stroke="#7FBF9E" strokeWidth="1.2" strokeDasharray="3 5" />
        </svg>
        <div className="core-heart"><HeartPulse size={30} strokeWidth={1.5} /></div>
        <span className="core-node node-a" />
        <span className="core-node node-b" />
        <span className="core-node node-c" />
      </div>
      <span className="visual-particle particle-a" aria-hidden="true" />
      <span className="visual-particle particle-b" aria-hidden="true" />
      <span className="visual-particle particle-c" aria-hidden="true" />
      <span className="visual-particle particle-d" aria-hidden="true" />

      <div className="visual-metric metric-heart">
        <span className="metric-icon"><Activity size={16} /></span>
        <span><small>HEALTH SIGNAL</small><strong>Heart rate · sample</strong></span>
      </div>
      <div className="visual-metric metric-ai">
        <span className="metric-icon"><BrainCircuit size={16} /></span>
        <span><small>POSSIBLE RISK CATEGORY</small><strong>More context needed</strong></span>
      </div>
      <div className="visual-focus-card">
        <span><ShieldCheck size={15} /> MEDISENSE AI</span>
        <strong>Context before conclusions.</strong>
      </div>
      <div className="visual-signal">
        <div className="signal-label"><span>HEALTH SIGNAL</span><span>ILLUSTRATIVE</span></div>
        <svg viewBox="0 0 420 60" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M0 31h68l13-1 8-8 8 19 10-27 10 31 9-14h45l13-1 9-8 8 19 10-27 10 31 9-14h48l13-1 8-8 8 19 10-27 10 31 9-14h64"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
      <figcaption className="sr-only">
        A conceptual illustration, not a real-time clinical reading.
      </figcaption>
    </figure>
  );
}

const problems: [string, string][] = [
  ['Early symptoms get ignored', 'It can be hard to know which changes deserve attention.'],
  ['Hard to tell what needs attention', 'Health information rarely makes urgency feel clear.'],
  ['Little accessible first-level guidance', 'People need a clear place to begin their questions.'],
  ['Online information confuses more than it helps', 'Conflicting sources can make a simple question feel overwhelming.'],
  ['Delayed care can worsen outcomes', 'A timely nudge can help someone seek appropriate professional care.'],
];

const processSteps: { number: string; title: string; body: string; icon: LucideIcon }[] = [
  { number: '01', title: 'User input', body: 'Share a symptom or information from a report in your own words.', icon: MessageCircle },
  { number: '02', title: 'Data processing', body: 'Your information is structured and prepared for careful review.', icon: Workflow },
  { number: '03', title: 'AI / NLP analysis', body: 'Language patterns and context help organize what you shared.', icon: BrainCircuit },
  { number: '04', title: 'Risk assessment', body: 'Potential warning signs are prioritized for safer next steps.', icon: Activity },
  { number: '05', title: 'Personalized guidance', body: 'Receive plain-language information shaped around your answers.', icon: HeartPulse },
  { number: '06', title: 'Healthcare professional', body: 'A clinician remains the authority for diagnosis and care.', icon: Stethoscope },
];

const features: { title: string; body: string; icon: LucideIcon; featured?: boolean }[] = [
  { title: 'AI symptom analysis', body: 'Organize what you are experiencing and see when professional help may be appropriate.', icon: HeartPulse, featured: true },
  { title: 'Risk-level assessment', body: 'Surface possible urgency in plain language without claiming to diagnose.', icon: Activity },
  { title: 'Natural-language interaction', body: 'Relevant follow-up questions help clarify information you choose to share.', icon: MessageCircle },
  { title: 'Personalized guidance', body: 'Understand possible next actions, from monitoring to contacting a clinician.', icon: CircleDot },
  { title: 'Explainable recommendations', body: 'See what information was considered and where uncertainty remains.', icon: Network },
  { title: 'Health-history awareness', body: 'Keep the context you provide connected to your own health journey.', icon: Database, featured: true },
  { title: 'Emergency warning detection', body: 'Urgent warning signs are brought forward rather than buried in a summary.', icon: ShieldCheck },
  { title: 'Simple accessible interface', body: 'Clear, approachable guidance designed to make health information easier to use.', icon: UsersRound },
];

const architecture = [
  'Input',
  'Symptom extraction',
  'Feature processing',
  'Model inference',
  'Risk classification',
  'Response generation',
  'Safety layer',
];

const journey = [
  ['01', 'You report symptoms', 'Tell us what you are experiencing.'],
  ['02', 'Relevant follow-up questions', 'A few questions add useful context.'],
  ['03', 'Information is analyzed', 'Your answers are carefully organized.'],
  ['04', 'Possible risk level', 'Potential warning signs are brought forward.'],
  ['05', 'Plain-language guidance', 'Understand possible next steps.'],
  ['06', 'Professional care when needed', 'A clinician remains the final authority.'],
];

const impact: { title: string; icon: LucideIcon }[] = [
  { title: 'General health awareness', icon: HeartPulse },
  { title: 'Early risk identification', icon: Activity },
  { title: 'Rural and underserved communities', icon: UsersRound },
  { title: 'Health education', icon: BrainCircuit },
  { title: 'Telehealth support', icon: AudioLines },
  { title: 'Preventive healthcare', icon: ShieldCheck },
  { title: 'Student and young-adult health awareness', icon: UserRound },
];

const future: { title: string; icon: LucideIcon }[] = [
  { title: 'Wearable integration', icon: Watch },
  { title: 'Multilingual support', icon: Languages },
  { title: 'Voice interaction', icon: Mic2 },
  { title: 'Telemedicine integration', icon: AudioLines },
  { title: 'Personal health timeline', icon: Clock3 },
  { title: 'Clinical validation', icon: ShieldCheck },
  { title: 'Hospital & doctor integration', icon: Stethoscope },
];

export function MediSenseLanding() {
  return (
    <main id="main" className="landing-content">
      <section className="landing-hero slide-section slide-section-bg" id="hero">
        <div className="landing-container hero-layout">
          <div className="hero-copy">
            <Reveal direction="left">
              <p className="slide-eyebrow hero-section-number"><span aria-hidden="true" />01 · HERO</p>
              <PillBadge>HEALTH AI <span>•</span> EARLY AWARENESS</PillBadge>
              <h1>Understand your health.<br /><span>Know what to do next.</span></h1>
              <p className="hero-lede">
                AI-powered health awareness that turns symptoms and health information into clear,
                understandable next steps.
              </p>
              <div className="hero-actions">
                <Button href="/app/consult">Check your symptoms <span aria-hidden="true">→</span></Button>
                <Button href="#about" secondary>Explore MediSense</Button>
              </div>
              <p className="hero-safety-note"><ShieldCheck size={16} /> Not a diagnosis. Not a replacement for a clinician.</p>
            </Reveal>
          </div>
          <HealthCoreVisual />
        </div>
        <SlideFooter number="01" />
      </section>

      <section className="problem-section slide-section" id="problem">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader number="02" eyebrow="THE PROBLEM" title="Getting a little clarity shouldn't be so hard." />
          </Reveal>
          <div className="problem-grid">
            {problems.map(([title, body], index) => (
              <Reveal key={title} delay={index * 90} direction="up">
                <NumberCard number={`0${index + 1}`} title={title} inverted={index === problems.length - 1}>
                  {body}
                </NumberCard>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="02" />
      </section>

      <section className="product-section slide-section slide-section-bg" id="intelligence-preview">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader
              number="03"
              eyebrow="MEDISENSE INTELLIGENCE"
              title="Thoughtful questions. A clearer next step."
              description="An illustrative preview of a guided symptom check—not a diagnosis or a clinical reading."
            />
          </Reveal>
          <Reveal direction="up" className="product-reveal">
            <div className="product-window">
              <aside className="dashboard-aside">
                <p className="dashboard-label">YOUR HEALTH CHECK</p>
                <h3>Symptoms shared</h3>
                <div className="symptom-chips"><span>Headache</span><span>Fatigue</span><span>Dizziness</span></div>
                <div className="dashboard-divider" />
                <p className="dashboard-label">POSSIBLE RISK CATEGORY</p>
                <div className="risk-meter"><span /><span /><span /></div>
                <div className="risk-legend"><span>Low</span><span>Moderate</span><span>Urgent</span></div>
                <strong className="risk-example">Illustrative only</strong>
              </aside>
              <div className="dashboard-main">
                <div className="followup-head">
                  <span className="followup-icon"><BrainCircuit size={19} /></span>
                  <div><small>AI FOLLOW-UP</small><h3>What other symptoms are you experiencing?</h3></div>
                </div>
                <div className="preview-question"><span>01</span><p>When did these symptoms first begin?</p><Check size={15} /></div>
                <div className="preview-question preview-question-typing"><span>02</span><p>Have you noticed anything that makes them better or worse?</p><i aria-hidden="true" /></div>
                <div className="next-step-preview">
                  <ShieldCheck size={18} />
                  <span><small>POSSIBLE NEXT STEP</small><strong>Monitor, consult a doctor, or seek urgent care—depending on your answers.</strong></span>
                </div>
              </div>
              <div className="product-window-foot"><span><ShieldCheck size={14} /> Informational support. Professional care remains essential.</span></div>
            </div>
          </Reveal>
        </div>
        <SlideFooter number="03" />
      </section>

      <section className="process-section slide-section" id="how-it-works">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader number="04" eyebrow="HOW IT WORKS" title="A thoughtful process, from first question to next step." />
          </Reveal>
          <div className="process-track">
            <LineDraw className="process-connector" />
            {processSteps.map(({ number, title, body, icon: Icon }, index) => (
              <Reveal key={number} delay={index * 85} direction="up" className={`process-card-wrap${index === 5 ? ' process-card-last' : ''}`}>
                <NumberCard number={number} title={title} inverted={index === processSteps.length - 1}>
                  <span className="number-card-icon"><Icon size={18} /></span>
                  {body}
                </NumberCard>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="04" />
      </section>

      <section className="feature-section slide-section slide-section-bg" id="features">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader number="05" eyebrow="FEATURES" title="Helpful by design. Careful at every step." />
          </Reveal>
          <div className="feature-grid">
            {features.map(({ title, body, icon: Icon, featured }, index) => (
              <Reveal key={title} delay={(index % 4) * 80} direction={index % 2 ? 'right' : 'up'}>
                <article className={`feature-card${featured ? ' feature-card-cream' : ''}${index === 7 ? ' feature-card-inverted' : ''}`}>
                  <span className="feature-index">0{index + 1}</span>
                  <Icon size={21} strokeWidth={1.5} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="05" />
      </section>

      <section className="architecture-section slide-section" id="technology">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader number="06" eyebrow="AI ARCHITECTURE" title="A clear process, with safety at every layer." />
          </Reveal>
          <div className="architecture-rail">
            <LineDraw className="architecture-connector" />
            {architecture.map((stage, index) => (
              <Reveal key={stage} delay={index * 70} direction="up">
                <div className={`architecture-node${index === architecture.length - 1 ? ' architecture-node-final' : ''}`}>
                  <span className="architecture-number">0{index + 1}</span>
                  <span className="architecture-dot">{index === architecture.length - 1 ? <ShieldCheck size={18} /> : <Network size={17} />}</span>
                  <span className="architecture-label">{stage}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="06" />
      </section>

      <section className="safety-section slide-section slide-section-dark" id="safety">
        <div className="landing-container safety-layout">
          <Reveal direction="left">
            <SectionHeader
              number="07"
              eyebrow="SAFETY FIRST"
              title="Trust begins with knowing our limits."
              description="MediSense supports awareness and clearer conversations—not diagnosis. Clinicians remain the final authority."
              dark
            />
          </Reveal>
          <Reveal direction="right">
            <div className="safety-panel">
              <div className="safety-emblem" role="img" aria-label="Shield with a check mark, representing a safety-first approach">
                <svg viewBox="0 0 120 140" fill="none" aria-hidden="true">
                  <path d="M60 7 108 25v38c0 31-19 54-48 70C31 117 12 94 12 63V25L60 7Z" stroke="currentColor" strokeWidth="2" />
                  <path d="m38 68 15 15 30-33" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="safety-checks">
                {[
                  'No definitive diagnosis',
                  'Emergency symptoms get priority',
                  'Professional consultation encouraged',
                  'AI limitations clearly stated',
                  'Minimal sensitive data',
                  'Healthcare professionals remain the final authority',
                ].map((item) => <p key={item}><span><Check size={13} /></span>{item}</p>)}
              </div>
            </div>
          </Reveal>
        </div>
        <SlideFooter number="07" />
      </section>

      <section className="guidance-section slide-section slide-section-bg" id="about">
        <div className="landing-container guidance-layout">
          <Reveal direction="left">
            <SectionHeader
              number="08"
              eyebrow="CLEAR GUIDANCE"
              title="Clear guidance. Safer decisions."
              description="Health and medicine information can be difficult to understand. MediSense explains information in plain language and helps you recognize when professional advice is needed."
            />
            <p className="guidance-boundary"><ShieldCheck size={18} /> We explain information. We do not prescribe medicines or doses.</p>
          </Reveal>
          <Reveal direction="right">
            <div className="medicine-visual" role="img" aria-label="Illustration of a medicine capsule with connected informational data lines">
              <div className="medicine-orbit" />
              <div className="medicine-core"><div className="capsule"><span /><i /></div></div>
              <span className="medicine-node medicine-node-one"><HeartPulse size={16} /></span>
              <span className="medicine-node medicine-node-two"><Activity size={16} /></span>
              <span className="medicine-node medicine-node-three"><ShieldCheck size={16} /></span>
              <div className="medicine-data"><span>HEALTH INFORMATION</span><strong>Context, not a prescription</strong></div>
            </div>
          </Reveal>
        </div>
        <SlideFooter number="08" />
      </section>

      <section className="journey-section slide-section" id="journey">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader number="09" eyebrow="YOUR JOURNEY" title="A little more clarity, one step at a time." />
          </Reveal>
          <div className="journey-flow">
            <LineDraw vertical className="journey-connector" />
            {journey.map(([number, title, body], index) => (
              <Reveal key={number} delay={index * 70} direction={index % 2 ? 'right' : 'left'}>
                <article className="journey-step">
                  <span className="journey-dot">{number}</span>
                  <div><h3>{title}</h3><p>{body}</p></div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="09" />
      </section>

      <section className="impact-section slide-section slide-section-bg">
        <div className="landing-container impact-layout">
          <Reveal direction="left">
            <SectionHeader
              number="10"
              eyebrow="IMPACT"
              title="Healthcare information should be understandable to everyone."
              description="Clarity can help more people feel prepared to ask questions and find the right care—wherever they begin."
            />
          </Reveal>
          <div className="impact-grid">
            {impact.map(({ title, icon: Icon }, index) => (
              <Reveal key={title} delay={index * 65} direction={index % 2 ? 'right' : 'up'}>
                <div className={`impact-item${index === impact.length - 1 ? ' impact-item-inverted' : ''}`}>
                  <Icon size={19} aria-hidden="true" />
                  <span>{title}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="10" />
      </section>

      <section className="future-section slide-section" id="future">
        <div className="landing-container">
          <Reveal direction="left">
            <SectionHeader number="11" eyebrow="FUTURE SCOPE" title="Building toward what's next." />
          </Reveal>
          <div className="future-timeline">
            <LineDraw className="future-connector" />
            {future.map(({ title, icon: Icon }, index) => (
              <Reveal key={title} delay={index * 70} direction="up">
                <article className="future-item">
                  <span className="future-dot"><Icon size={17} /></span>
                  <span className="future-number">0{index + 1}</span>
                  <h3>{title}</h3>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
        <SlideFooter number="11" />
      </section>

      <section className="final-cta slide-section slide-section-dark">
        <div className="cta-orbit cta-orbit-one" aria-hidden="true" />
        <div className="cta-orbit cta-orbit-two" aria-hidden="true" />
        <div className="landing-container final-cta-content">
          <Reveal direction="up">
            <SectionHeader
              number="12"
              eyebrow="YOUR NEXT STEP"
              title="Understand your health. Take the next step."
              description="MediSense AI helps turn confusing health information into clear, understandable guidance."
              dark
            />
            <Button href="/app/consult" className="cta-button">Start your health check <span aria-hidden="true">→</span></Button>
            <p className="cta-disclaimer">For awareness and information—not a diagnosis or a substitute for professional care.</p>
          </Reveal>
        </div>
        <SlideFooter number="12" />
      </section>
    </main>
  );
}
