'use client';

import { useState, useEffect } from 'react';
import { CustomModal } from '@/components/ui/CustomModal';
import { CustomInput } from '@/components/ui/CustomInput';
import { CustomButton } from '@/components/ui/CustomButton';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { CustomBadge } from '@/components/ui/CustomBadge';

interface CreateAppWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (appData: any) => void;
  isSubmitting?: boolean;
}

const FRAMEWORK_PRESETS = [
  { value: 'nextjs', label: 'Next.js 14 (React)', description: 'Fullstack Next.js App Router' },
  { value: 'nestjs', label: 'NestJS (TypeScript)', description: 'Backend Microservice REST/GraphQL' },
  { value: 'python', label: 'Python (FastAPI / Django)', description: 'Python Web Application' },
  { value: 'static', label: 'Static Site (HTML/CSS)', description: 'Static files served via Nginx' },
  { value: 'docker', label: 'Dockerfile Container', description: 'Custom Dockerfile deployment' },
];

export function CreateAppWizardModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: CreateAppWizardModalProps) {
  const [step, setStep] = useState(1);

  // Form State
  const [appName, setAppName] = useState('');
  const [framework, setFramework] = useState('nextjs');
  const [domain, setDomain] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [port, setPort] = useState(3000);
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([
    { key: 'NODE_ENV', value: 'production' },
  ]);
  const [maxMemory, setMaxMemory] = useState(512);

  // Auto-generate domain when app name changes
  useEffect(() => {
    if (appName) {
      const slug = appName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      setDomain(`${slug}.hamyar.io`);
    } else {
      setDomain('');
    }
  }, [appName]);

  const serverIp = '91.220.113.171';

  const addEnvVar = () => setEnvVars([...envVars, { key: '', value: '' }]);
  const removeEnvVar = (idx: number) => setEnvVars(envVars.filter((_, i) => i !== idx));
  const updateEnvVar = (idx: number, key: string, value: string) => {
    const copy = [...envVars];
    copy[idx] = { key, value };
    setEnvVars(copy);
  };

  const handleFinish = () => {
    onSubmit({
      name: appName,
      framework,
      domain,
      gitRepo,
      branch,
      port,
      envVars,
      maxMemory,
    });
  };

  return (
    <CustomModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Application (Multi-Step Setup)"
      description={`Step ${step} of 5 — ${
        step === 1
          ? 'Basic Info & Framework'
          : step === 2
          ? 'Domain & DNS Configuration'
          : step === 3
          ? 'Git Source & Build Setup'
          : step === 4
          ? 'Environment Variables'
          : 'Resource Limits & Review'
      }`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Step Indicator Bar */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === i
                    ? 'bg-primary text-white'
                    : step > i
                    ? 'bg-success/20 text-success'
                    : 'bg-surface-2 text-muted-foreground'
                }`}
              >
                {step > i ? '✓' : i}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  step === i ? 'text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                {i === 1 ? 'General' : i === 2 ? 'Domain & DNS' : i === 3 ? 'Git Source' : i === 4 ? 'Environment' : 'Review'}
              </span>
            </div>
          ))}
        </div>

        {/* STEP 1: General Info & Framework */}
        {step === 1 && (
          <div className="space-y-4">
            <CustomInput
              label="Application Name"
              placeholder="e.g. hamyar-payment-service"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
            <CustomSelect
              label="Framework Preset"
              value={framework}
              onChange={setFramework}
              options={FRAMEWORK_PRESETS}
            />
          </div>
        )}

        {/* STEP 2: Auto Subdomain & DNS Records */}
        {step === 2 && (
          <div className="space-y-4">
            <CustomInput
              label="Application Subdomain / Custom Domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              helperText="Auto-generated domain for Nginx proxy pass"
            />

            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">Required Provider DNS Records</h4>
                <CustomBadge variant="warning">Action Required in Provider</CustomBadge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Before deploying, please add the following DNS records in your DNS provider (e.g. Cloudflare, ArvanCloud):
              </p>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-surface border-b border-border text-muted-foreground font-semibold">
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Host / Name</th>
                      <th className="px-3 py-2">Value / Points To</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="bg-surface">
                      <td className="px-3 py-2 font-mono font-bold text-primary">A</td>
                      <td className="px-3 py-2 font-mono">{domain.split('.')[0] || '@'}</td>
                      <td className="px-3 py-2 font-mono">{serverIp}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => navigator.clipboard.writeText(serverIp)}
                          className="px-2 py-0.5 text-[10px] rounded bg-surface-2 border border-border hover:bg-surface"
                        >
                          Copy IP
                        </button>
                      </td>
                    </tr>
                    <tr className="bg-surface">
                      <td className="px-3 py-2 font-mono font-bold text-primary">TXT</td>
                      <td className="px-3 py-2 font-mono">_ssl-challenge.{domain.split('.')[0]}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">hamyar-verify=ssl-token-98124</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => navigator.clipboard.writeText('hamyar-verify=ssl-token-98124')}
                          className="px-2 py-0.5 text-[10px] rounded bg-surface-2 border border-border hover:bg-surface"
                        >
                          Copy TXT
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Source Code & Repository */}
        {step === 3 && (
          <div className="space-y-4">
            <CustomInput
              label="Git Repository URL"
              placeholder="https://github.com/hamyar-co/backend.git"
              value={gitRepo}
              onChange={(e) => setGitRepo(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <CustomInput
                label="Git Branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
              <CustomInput
                label="Internal Container Port"
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* STEP 4: Environment Variables */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">App Environment Variables</span>
              <CustomButton size="sm" variant="outline" onClick={addEnvVar}>+ Add Variable</CustomButton>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {envVars.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    placeholder="KEY"
                    value={v.key}
                    onChange={(e) => updateEnvVar(i, e.target.value, v.value)}
                    className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-border bg-surface text-foreground"
                  />
                  <input
                    placeholder="VALUE"
                    value={v.value}
                    onChange={(e) => updateEnvVar(i, v.key, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-border bg-surface text-foreground"
                  />
                  <button
                    onClick={() => removeEnvVar(i)}
                    className="text-error hover:bg-error/10 px-2 py-1.5 rounded text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: Resource Limits & Final Confirmation */}
        {step === 5 && (
          <div className="space-y-4">
            <CustomInput
              label="Memory Limit (MB)"
              type="number"
              value={maxMemory}
              onChange={(e) => setMaxMemory(Number(e.target.value))}
            />

            <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2 text-xs">
              <h4 className="font-semibold text-foreground border-b border-border pb-2">Deployment Summary</h4>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">App Name:</span>
                <span className="font-bold text-foreground">{appName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Framework:</span>
                <span className="font-medium text-primary uppercase">{framework}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Generated Domain:</span>
                <span className="font-mono text-foreground">{domain}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Git Repository:</span>
                <span className="font-mono text-muted-foreground truncate max-w-xs">{gitRepo || 'None'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          {step > 1 ? (
            <CustomButton variant="outline" onClick={() => setStep(step - 1)}>
              ← Back
            </CustomButton>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <CustomButton disabled={!appName && step === 1} onClick={() => setStep(step + 1)}>
              Next →
            </CustomButton>
          ) : (
            <CustomButton loading={isSubmitting} onClick={handleFinish}>
              Deploy Application
            </CustomButton>
          )}
        </div>
      </div>
    </CustomModal>
  );
}
