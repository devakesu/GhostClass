import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BuildInfoPage from '../page';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  ArrowLeft: () => null,
  ExternalLink: () => null,
}));

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    <div data-testid="card" className={className}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    <button {...props}>{children}</button>,
}));

// Mock copy-button client components
vi.mock('../copy-button', () => ({
  CopyButton: ({ label }: { label: string }) => <button>{label}</button>,
  InlineCopyButton: () => <button title="Copy digest">Copy</button>,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
}));

describe('BuildInfoPage (Server Component)', () => {
  beforeEach(() => {
    vi.stubEnv('APP_COMMIT_SHA', 'abc1234567890');
    vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo');
    vi.stubEnv('GITHUB_RUN_ID', '123456');
    vi.stubEnv('GITHUB_RUN_NUMBER', '789');
    vi.stubEnv('BUILD_TIMESTAMP', '2026-02-18T10:00:00Z');
    vi.stubEnv('AUDIT_STATUS', 'PASSED');
    vi.stubEnv('SIGNATURE_STATUS', 'UNSIGNED');
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.8.0');
    vi.stubEnv('IMAGE_DIGEST', 'sha256:abc123');
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('should render build information heading', () => {
    render(<BuildInfoPage />);
    expect(screen.getByRole('heading', { name: /Build Information/i })).toBeInTheDocument();
  });

  it('should display the app version', () => {
    render(<BuildInfoPage />);
    const versionElements = screen.getAllByText(/1\.8\.0/);
    expect(versionElements.length).toBeGreaterThan(0);
  });

  it('should display the commit SHA (truncated)', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
  });

  it('should display the build timestamp', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('2026-02-18')).toBeInTheDocument();
  });

  it('should display PASSED audit status', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('PASSED')).toBeInTheDocument();
  });

  it('should display SKIPPED audit status in correct color', () => {
    vi.stubEnv('AUDIT_STATUS', 'SKIPPED');
    render(<BuildInfoPage />);
    const status = screen.getByText('SKIPPED');
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass('text-yellow-400');
  });

  it('should display FAILED audit status in red', () => {
    vi.stubEnv('AUDIT_STATUS', 'FAILED');
    render(<BuildInfoPage />);
    const status = screen.getByText('FAILED');
    expect(status).toHaveClass('text-red-400');
  });

  it('should display UNKNOWN when audit status is empty', () => {
    vi.stubEnv('AUDIT_STATUS', '');
    render(<BuildInfoPage />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });

  it('should display GitHub links when repo is valid', () => {
    render(<BuildInfoPage />);
    const buildLinks = screen.getAllByRole('link', { name: /#789/i });
    expect(buildLinks.length).toBeGreaterThan(0);
    expect(buildLinks[0]).toHaveAttribute('href', 'https://github.com/owner/repo/actions/runs/123456');
  });

  it('should display Source Code card when github_repo is valid', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('Source Code')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View on GitHub/i });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo');
  });

  it('should display Security Scorecard card when github_repo is valid', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('Security Scorecard')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View Scorecard/i });
    expect(link).toHaveAttribute('href', 'https://scorecard.dev/viewer/?uri=github.com/owner/repo');
  });

  it('should not display GitHub cards when repo is empty', () => {
    vi.stubEnv('GITHUB_REPOSITORY', '');
    vi.stubEnv('NEXT_PUBLIC_GITHUB_URL', '');
    render(<BuildInfoPage />);
    expect(screen.queryByText('Source Code')).not.toBeInTheDocument();
    expect(screen.queryByText('Security Scorecard')).not.toBeInTheDocument();
  });

  it('should not display GitHub cards when repo is invalid format', () => {
    vi.stubEnv('GITHUB_REPOSITORY', 'not-a-valid/repo/../hack');
    render(<BuildInfoPage />);
    expect(screen.queryByText('Source Code')).not.toBeInTheDocument();
  });

  it('should display SLSA provenance link when signature is generated', () => {
    vi.stubEnv('SIGNATURE_STATUS', 'SLSA_PROVENANCE_GENERATED');
    render(<BuildInfoPage />);
    const link = screen.getByRole('link', { name: /SLSA_PROVENANCE_GENERATED/i });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/attestations');
    expect(screen.getByText('✔ Verified')).toBeInTheDocument();
  });

  it('should display Attestations card when SLSA provenance is generated', () => {
    vi.stubEnv('SIGNATURE_STATUS', 'SLSA_PROVENANCE_GENERATED');
    render(<BuildInfoPage />);
    expect(screen.getByText('Attestations')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View Attestations/i });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/attestations');
  });

  it('should not display Attestations card for UNSIGNED', () => {
    render(<BuildInfoPage />);
    expect(screen.queryByText('Attestations')).not.toBeInTheDocument();
  });

  it('should display image digest section when available and not "dev"', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('sha256:abc123')).toBeInTheDocument();
  });

  it('should not display image digest when value is "dev"', () => {
    vi.stubEnv('IMAGE_DIGEST', 'dev');
    vi.stubEnv('APP_COMMIT_SHA', 'dev');
    render(<BuildInfoPage />);
    expect(screen.queryByText(/IMAGE_DIGEST/)).not.toBeInTheDocument();
  });

  it('should display PRODUCTION environment label', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();
  });

  it('should display Containerized badge when container is true', () => {
    vi.stubEnv('APP_COMMIT_SHA', 'abc123');
    render(<BuildInfoPage />);
    expect(screen.getByText('(Containerized)')).toBeInTheDocument();
  });

  it('should display "What is Build Provenance?" section', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('What is Build Provenance?')).toBeInTheDocument();
    const slsaLink = screen.getByRole('link', { name: /SLSA/i });
    expect(slsaLink).toHaveAttribute('href', 'https://slsa.dev');
  });

  it('should have a back to home link', () => {
    render(<BuildInfoPage />);
    const link = screen.getByRole('link', { name: /Back to Home/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('should display Build Logs card when run_id and valid repo', () => {
    render(<BuildInfoPage />);
    expect(screen.getByText('Build Logs')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View Build #789/i });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/actions/runs/123456');
  });

  it('should format timestamp correctly', () => {
    vi.stubEnv('BUILD_TIMESTAMP', '2026-02-18T15:30:45Z');
    render(<BuildInfoPage />);
    expect(screen.getByText('2026-02-18')).toBeInTheDocument();
    expect(screen.getByText('15:30:45 UTC')).toBeInTheDocument();
  });

  it('should show Local Mode when timestamp is empty', () => {
    vi.stubEnv('BUILD_TIMESTAMP', '');
    render(<BuildInfoPage />);
    expect(screen.getByText('Local Mode')).toBeInTheDocument();
  });
});
