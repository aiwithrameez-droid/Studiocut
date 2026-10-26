import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import studioCutPackage from '../package.json';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowUpRight, Check, Clock3, Download, Film, FileAudio, HardDrive,
  FileVideo, Maximize2, Pause,
  Play, Plus, Redo2, Scissors, Search, Settings2, SkipBack, SkipForward, Sparkles,
  Trash2, Type, Undo2, Upload, Volume2, ZoomIn, ZoomOut, X,
} from 'lucide-react';
import {
  BrowserRouter as EditorBrowserRouter,
  Navigate as EditorNavigate,
  Route as EditorRoute,
  Routes as EditorRoutes,
  useNavigate as useEditorNavigate,
  useParams as useEditorParams,
} from 'react-router-dom';
import { Link, Route as WouterRoute, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  buildDefaultScene,
  createDefaultAdapters,
  EditorCore,
  VideoEditor,
  ZERO_MEDIA_TIME,
  type ProjectMeta,
  type TProject,
  type VideoEditorAdapters,
} from 'studiocut-artcraft-runtime';
import { createIndexedDBMediaSource } from './adapters/indexeddb-media-source';
import { createLocalSoundsAdapter } from './adapters/local-sounds';
import { createProjectArchive, restoreProjectArchive } from './lib/project-archive';
import { StudioCutMark } from './components/brand/studio-cut-mark';
import { StudioThemePicker, StudioThemeProvider } from './theme/studio-theme';
import AdminPage from './pages/admin';
import SupportPage from './pages/support';
import {
  fetchCurrentUserProfile,
  recordUsageEvent,
  saveCurrentUserProfile,
  type CurrentUserProfile,
} from './lib/account-api';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const isDesktopBuild = import.meta.env.MODE === 'desktop';
const desktopReleaseBaseUrl = 'https://github.com/aiwithrameez-droid/Studiocut/releases/latest/download';
const desktopDownloads = [
  {
    label: 'Windows x64',
    detail: 'Installer · .exe',
    fileName: `StudioCut-${studioCutPackage.version}-win-x64.exe`,
  },
  {
    label: 'Mac · Intel',
    detail: 'macOS 13+ · Unsigned',
    fileName: `StudioCut-${studioCutPackage.version}-mac-x64.dmg`,
  },
  {
    label: 'Mac · Apple Silicon',
    detail: 'macOS 13+ · Unsigned',
    fileName: `StudioCut-${studioCutPackage.version}-mac-arm64.dmg`,
  },
];
const clerkPubKey = isDesktopBuild ? '' : publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey && !isDesktopBuild) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY for StudioCut sign-in.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(var(--primary))',
    colorForeground: 'hsl(var(--foreground))',
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorDanger: 'hsl(var(--destructive))',
    colorBackground: 'hsl(var(--card))',
    colorInput: 'hsl(var(--background))',
    colorInputForeground: 'hsl(var(--foreground))',
    colorNeutral: 'hsl(var(--border))',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-border',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-semibold tracking-tight text-foreground',
    headerSubtitle: 'text-muted-foreground',
    socialButtonsBlockButtonText: 'font-medium text-foreground',
    formFieldLabel: 'text-foreground',
    footerActionLink: 'font-medium text-primary',
    footerActionText: 'text-muted-foreground',
    dividerText: 'text-muted-foreground',
    identityPreviewEditButton: 'text-primary',
    formFieldSuccessText: 'text-foreground',
    alertText: 'text-foreground',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'border border-border !bg-background hover:!bg-secondary',
    formButtonPrimary: 'bg-primary text-primary-foreground hover:brightness-110',
    formFieldInput: 'bg-background border-border text-foreground',
    footerAction: '!bg-transparent',
    dividerLine: 'bg-border',
    alert: 'border-border bg-muted',
    otpCodeFieldInput: 'bg-background border-border text-foreground',
    formFieldRow: 'text-foreground',
    main: 'text-foreground',
  },
};

type AssetKind = 'video' | 'audio' | 'image';
type ClipKind = AssetKind | 'title';
type Asset = { id: string; name: string; kind: AssetKind; duration: number; size: number; mime: string; width?: number; height?: number };
type Clip = { id: string; assetId?: string; kind: ClipKind; name: string; track: 'video' | 'overlay' | 'audio'; start: number; duration: number; sourceOffset: number; text?: string };
type Project = { name: string; aspect: '16:9' | '9:16' | '1:1'; fps: number; assets: Asset[]; clips: Clip[] };
type Snapshot = { past: Project[]; future: Project[] };

const DB_NAME = 'studiocut-local-project';
const DB_VERSION = 1;
const PROJECT_KEY = 'active';
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const BASE_TIMELINE_PIXELS_PER_SECOND = 90;
const initialProject: Project = { name: 'Untitled film', aspect: '16:9', fps: 30, assets: [], clips: [] };

const mediaMimeByExtension: Record<string, { kind: AssetKind; mime: string }> = {
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/x-m4v' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  webm: { kind: 'video', mime: 'video/webm' },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
  avi: { kind: 'video', mime: 'video/x-msvideo' },
  mpg: { kind: 'video', mime: 'video/mpeg' },
  mpeg: { kind: 'video', mime: 'video/mpeg' },
  ogv: { kind: 'video', mime: 'video/ogg' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/opus' },
  flac: { kind: 'audio', mime: 'audio/flac' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  avif: { kind: 'image', mime: 'image/avif' },
  bmp: { kind: 'image', mime: 'image/bmp' },
};

function getFileMediaType(file: File): { kind: AssetKind; mime: string } | null {
  const reportedMime = file.type.trim().toLowerCase();
  if (reportedMime.startsWith('video/')) return { kind: 'video', mime: file.type };
  if (reportedMime.startsWith('audio/')) return { kind: 'audio', mime: file.type };
  if (reportedMime.startsWith('image/')) return { kind: 'image', mime: file.type };
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  return mediaMimeByExtension[extension] ?? null;
}

function getMediaDuration(kind: AssetKind, url: string) {
  return new Promise<{ duration: number; width?: number; height?: number }>((resolve) => {
    let timeout: number | undefined;
    let media: HTMLMediaElement | null = null;
    let image: HTMLImageElement | null = null;
    let settled = false;
    const finish = (result: { duration: number; width?: number; height?: number }) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (media) {
        media.onloadedmetadata = null;
        media.onerror = null;
        media.removeAttribute('src');
        try { media.load(); } catch { /* metadata probe cleanup is best effort */ }
      }
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
      resolve(result);
    };
    if (kind === 'image') {
      const imageElement = new Image();
      image = imageElement;
      timeout = window.setTimeout(() => finish({ duration: 5 }), 10_000);
      imageElement.onload = () => finish({ duration: 5, width: imageElement.naturalWidth, height: imageElement.naturalHeight });
      imageElement.onerror = () => finish({ duration: 5 });
      imageElement.src = url;
      return;
    }
    media = document.createElement(kind === 'video' ? 'video' : 'audio');
    const mediaElement = media;
    timeout = window.setTimeout(() => finish({ duration: 5 }), 10_000);
    media.preload = 'metadata';
    mediaElement.onloadedmetadata = () => finish({
      duration: Number.isFinite(mediaElement.duration) && mediaElement.duration > 0 ? mediaElement.duration : 5,
      width: kind === 'video' ? (mediaElement as HTMLVideoElement).videoWidth : undefined,
      height: kind === 'video' ? (mediaElement as HTMLVideoElement).videoHeight : undefined,
    });
    mediaElement.onerror = () => finish({ duration: 5 });
    mediaElement.src = url;
    mediaElement.load();
  });
}

function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function dbRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openProjectDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}
const formatTime = (seconds: number) => {
  const value = Math.max(0, seconds);
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}.${Math.floor((value % 1) * 30).toString().padStart(2, '0')}`;
};
const formatBytes = (size: number) => size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StudioThemeProvider>
          {isDesktopBuild ? <ArtCraftEditorPage /> : (
            <WouterRouter base={basePath}>
              <ClerkProviderWithRoutes />
            </WouterRouter>
          )}
          <Toaster />
        </StudioThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function stripBasePath(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBasePath(to))}
      routerReplace={(to) => setLocation(stripBasePath(to), { replace: true })}
    >
      <ClerkQueryCacheInvalidator />
      <RoutedErrorBoundary>
        <Switch>
          <WouterRoute path="/" component={HomeRedirect} />
          <WouterRoute path="/sign-in/*?" component={SignInPage} />
          <WouterRoute path="/sign-up/*?" component={SignUpPage} />
          <WouterRoute path="/complete-profile" component={ProfileCompletionPage} />
          <WouterRoute path="/support" component={SupportPage} />
          <WouterRoute path="/projects" component={ProtectedEditorPage} />
          <WouterRoute path="/editor/:projectId" component={ProtectedEditorPage} />
          <WouterRoute path="/classic" component={ProtectedClassicPage} />
          <WouterRoute path="/admin" component={ProtectedAdminPage} />
          <WouterRoute component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </ClerkProvider>
  );
}

function ClerkQueryCacheInvalidator() {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [isLoaded, queryClient, user?.id]);

  return null;
}

function SignInPage() {
  return (
    <AuthPageShell>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/projects`}
      />
    </AuthPageShell>
  );
}

function SignUpPage() {
  return (
    <AuthPageShell>
      <div className="mb-5 rounded-xl border border-border bg-background/70 px-4 py-3 text-xs leading-5 text-muted-foreground">
        StudioCut stores your sign-in email, required phone number, and basic
        editing activity for your account and the private admin dashboard.
        Project files and imported media stay in your browser.
      </div>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/complete-profile`}
      />
    </AuthPageShell>
  );
}

function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-full bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md">
        <Link href="/" className="auth-back mb-6 inline-flex items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground" aria-label="Back to StudioCut home">
          <ArrowUpRight className="auth-back-arrow size-4 rotate-[-135deg]" aria-hidden="true" />
          <StudioCutMark className="size-6" />
          <span>Back to StudioCut</span>
        </Link>
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-primary">Your cut is waiting</p>
        {children}
      </div>
    </main>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const profile = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUserProfile,
    enabled: isLoaded && isSignedIn === true,
    retry: false,
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !profile.data) return;
    setLocation(profile.data.profileComplete ? '/projects' : '/complete-profile');
  }, [isLoaded, isSignedIn, profile.data, setLocation]);

  if (isLoaded && !isSignedIn) return <WelcomePage />;
  if (profile.isError) {
    return <AccountLoadError message="We couldn't load your account profile." onRetry={() => void profile.refetch()} />;
  }
  return <AuthLoading label="Loading your StudioCut workspace…" />;
}

function AuthenticatedRoute({
  children,
  allowIncompleteProfile = false,
}: {
  children: ReactNode;
  allowIncompleteProfile?: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location, setLocation] = useLocation();
  const profile = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUserProfile,
    enabled: isLoaded && isSignedIn === true,
    retry: false,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLocation('/sign-in');
      return;
    }
    if (
      profile.data &&
      !profile.data.profileComplete &&
      !allowIncompleteProfile &&
      location !== '/complete-profile'
    ) {
      setLocation('/complete-profile');
    }
  }, [allowIncompleteProfile, isLoaded, isSignedIn, location, profile.data, setLocation]);

  useEffect(() => {
    if (!profile.data?.profileComplete) return;
    if (location === '/projects') recordUsageEvent('projects_opened');
    else if (location.startsWith('/editor/')) recordUsageEvent('editor_opened');
  }, [location, profile.data?.profileComplete]);

  if (!isLoaded || (isSignedIn && profile.isLoading)) {
    return <AuthLoading label="Checking your account…" />;
  }
  if (!isSignedIn) return null;
  if (profile.isError) {
    return <AccountLoadError message="We couldn't verify your StudioCut account." onRetry={() => void profile.refetch()} />;
  }
  if (!allowIncompleteProfile && profile.data && !profile.data.profileComplete) {
    return <AuthLoading label="Opening your profile setup…" />;
  }
  return <>{children}</>;
}

function ProtectedEditorPage() {
  return (
    <AuthenticatedRoute>
      <ArtCraftEditorPage />
    </AuthenticatedRoute>
  );
}

function ProtectedClassicPage() {
  return (
    <AuthenticatedRoute>
      <StudioEditor />
    </AuthenticatedRoute>
  );
}

function ProtectedAdminPage() {
  return (
    <AuthenticatedRoute>
      <AdminPage />
    </AuthenticatedRoute>
  );
}

function ProfileCompletionPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const profile = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUserProfile,
    enabled: isLoaded && isSignedIn === true,
    retry: false,
  });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation('/sign-in');
    if (profile.data?.profileComplete) setLocation('/projects');
  }, [isLoaded, isSignedIn, profile.data?.profileComplete, setLocation]);

  const submitProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!consent) {
      setError('Please review and accept the data notice to continue.');
      return;
    }
    setSaving(true);
    try {
      await saveCurrentUserProfile({ phoneNumber, privacyConsent: true });
      await profile.refetch();
      setLocation('/projects');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your details.');
      setSaving(false);
    }
  };

  if (!isLoaded || !isSignedIn || profile.isLoading || profile.data?.profileComplete) {
    return <AuthLoading label="Preparing your account…" />;
  }
  if (profile.isError) {
    return <AccountLoadError message="We couldn't load your account profile." onRetry={() => void profile.refetch()} />;
  }

  return (
    <main className="grid min-h-full place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">One last step</p>
        <h1 className="mt-2 text-2xl font-semibold">Complete your StudioCut profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account uses {profile.data?.email || 'your verified sign-in email'}.
          Enter a phone number to continue.
        </p>
        <form className="mt-6 space-y-5" onSubmit={(event) => void submitProfile(event)}>
          <label className="block space-y-2 text-sm font-medium">
            Phone number
            <input
              type="tel"
              required
              minLength={7}
              maxLength={24}
              autoComplete="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.currentTarget.value)}
              placeholder="+92 300 1234567"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.currentTarget.checked)}
              className="mt-1 size-4 accent-[var(--studio-accent)]"
            />
            <span>
              I understand StudioCut stores my email, phone number, and basic
              editing activity for account management and product usage charts.
              Only the configured admin can view identifiable account details.
              My project files and imported media stay in this browser.
            </span>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={saving || !consent}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving profile…' : 'Continue to StudioCut'}
          </button>
        </form>
      </section>
    </main>
  );
}

function AuthLoading({ label }: { label: string }) {
  return (
    <main className="grid min-h-full place-items-center bg-background text-sm text-muted-foreground" aria-busy="true">
      <div className="flex flex-col items-center gap-4">
        <StudioCutMark className="studiocut-mark-pulse size-10" />
        <p role="status">{label}</p>
      </div>
    </main>
  );
}

function AccountLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-full place-items-center bg-background px-5 text-foreground">
      <section className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <StudioCutMark className="mx-auto mb-4 size-10" />
        <h1 className="font-semibold">Account check failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Try again
        </button>
      </section>
    </main>
  );
}

function WelcomePage() {
  const [ready, setReady] = useState(false);

  return (
    <main className="welcome-page">
      <div className="welcome-grain" aria-hidden="true" />
      <header className="welcome-header">
        <div className="welcome-brand">
          <StudioCutMark className="size-8" />
          <span>StudioCut</span>
        </div>
        <nav className="welcome-auth-nav" aria-label="Account">
          <Link href="/support" className="welcome-auth-link">Donate</Link>
          <Link href="/sign-in" className="welcome-auth-link">Sign in</Link>
          <Link href="/sign-up" className="welcome-auth-link welcome-auth-link-primary">Create account</Link>
        </nav>
      </header>

      <section className="welcome-stage" aria-labelledby="welcome-title">
        <div className="welcome-side-note" aria-hidden="true">
          <span className="welcome-side-rule" />
          <span>FRAME 01&nbsp; / &nbsp;BEGIN</span>
        </div>

        <div className="welcome-content">
          <div className="welcome-kicker">
            <span className="welcome-kicker-dot" />
            YOUR EDITING ROOM
          </div>
          <h1 id="welcome-title" className="welcome-title">
            Cut to<br />
            the <em>moment.</em>
          </h1>
          <p className="welcome-copy">
            Cut, shape, and export video right in your browser.
            Your projects stay on this device.
          </p>

          <div className="welcome-prompt-wrap">
            <button
              type="button"
              className={`welcome-prompt${ready ? ' is-ready' : ''}`}
              onClick={() => setReady(true)}
              aria-live="polite"
              aria-atomic="true"
              data-testid="button-ready-to-edit"
            >
              <span className="welcome-prompt-mark" aria-hidden="true">
                {ready ? <Check /> : <Play />}
              </span>
              <span className="welcome-prompt-text">
                {ready ? 'Yes I am ready' : 'Are you ready to edit?'}
              </span>
            </button>
            <div className={`welcome-next${ready ? ' is-visible' : ''}`} aria-hidden={!ready}>
              <Link href="/projects" className="welcome-library-link" tabIndex={ready ? 0 : -1} data-testid="link-project-library">
                <span>Enter your project library</span>
                <ArrowUpRight aria-hidden="true" />
              </Link>
              <span className="welcome-next-note">Pick up where you left off, or start a new cut.</span>
            </div>
          </div>
        </div>

        <div className="welcome-console" aria-hidden="true">
          <div className="welcome-console-top">
            <span>STUDIOCUT&nbsp; / &nbsp;EDIT</span>
            <span className="welcome-console-live"><i /> READY</span>
          </div>
          <div className="welcome-monitor">
            <div className="welcome-monitor-grid" />
            <div className="welcome-monitor-crosshair"><span /><span /></div>
            <div className="welcome-monitor-time">00:00:00:00</div>
            <div className="welcome-monitor-label">PREVIEW&nbsp; 1920 × 1080</div>
            <div className="welcome-monitor-center"><StudioCutMark className="size-14" /></div>
          </div>
          <div className="welcome-console-bottom">
            <div className="welcome-track-label"><span>V1</span><i /></div>
            <div className="welcome-track">
              <span className="welcome-track-clip clip-a" />
              <span className="welcome-track-clip clip-b" />
              <span className="welcome-playhead" />
            </div>
            <div className="welcome-track-label"><span>A1</span><i /></div>
            <div className="welcome-track audio-track">
              <span className="welcome-waveform" />
            </div>
          </div>
          <div className="welcome-console-foot">
            <span>LOCAL STORAGE</span>
            <span>30 FPS</span>
            <span>16:9</span>
          </div>
        </div>
      </section>

      <section className="welcome-downloads" aria-labelledby="welcome-downloads-title">
        <div className="welcome-downloads-heading">
          <p className="welcome-downloads-kicker">DESKTOP BUILDS · v{studioCutPackage.version}</p>
          <h2 id="welcome-downloads-title">Get StudioCut for desktop</h2>
        </div>
        <div className="welcome-download-grid">
          {desktopDownloads.map((download) => (
            <a
              key={download.fileName}
              className="welcome-download-link"
              href={`${desktopReleaseBaseUrl}/${download.fileName}`}
              aria-label={`Download StudioCut for ${download.label}`}
            >
              <span className="welcome-download-copy">
                <strong>{download.label}</strong>
                <span>{download.detail}</span>
              </span>
              <Download aria-hidden="true" />
            </a>
          ))}
        </div>
        <p className="welcome-download-note">
          Mac builds are unsigned and may show a Gatekeeper warning. The Windows installer is also unsigned and may show a SmartScreen warning.
        </p>
      </section>

      <footer className="welcome-footer">
        <span>StudioCut <b>/</b> frame one starts here</span>
        <span>LOCAL MEDIA. PRIVATE PROJECTS. JUST THE WORK.</span>
      </footer>
    </main>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

const DEFAULT_PROJECT_ID = 'studiocut-default-project';
let projectOpenQueue: Promise<void> = Promise.resolve();
const projectsOpening = new Map<string, Promise<void>>();

function ArtCraftEditorPage() {
  const adapters = useMemo<VideoEditorAdapters>(() => ({
    ...createDefaultAdapters(),
    mediaSource: createIndexedDBMediaSource(),
    soundsAdapter: createLocalSoundsAdapter(),
  }), []);

  // The editor is a singleton; initialize before either the library or
  // the upstream shell asks for it so the persistent media adapter wins.
  EditorCore.initialize({ adapters });

  return (
    <EditorBrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <EditorRoutes>
        <EditorRoute path="/" element={<EditorNavigate to={`/editor/${DEFAULT_PROJECT_ID}`} replace />} />
        <EditorRoute path="/projects" element={<ProjectLibrary />} />
        <EditorRoute path="/editor/:projectId" element={<EditorWorkspace adapters={adapters} />} />
        <EditorRoute path="*" element={<EditorNavigate to="/projects" replace />} />
      </EditorRoutes>
    </EditorBrowserRouter>
  );
}

function ProjectLibrary() {
  const navigate = useEditorNavigate();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveStatus, setArchiveStatus] = useState('');
  const [archivePercent, setArchivePercent] = useState(0);
  const restoreInput = useRef<HTMLInputElement>(null);
  const archiveLock = useRef(false);

  const runArchive = async (action: () => Promise<void>) => {
    if (archiveLock.current) return;
    archiveLock.current = true;
    setArchiveBusy(true);
    setError('');
    setArchiveStatus('Preparing…');
    setArchivePercent(0);
    try { await action(); }
    catch (reason) {
      setArchiveStatus('');
      setError(reason instanceof Error ? reason.message : 'Backup or restore failed. Check available browser storage and try again.');
    } finally {
      archiveLock.current = false;
      setArchiveBusy(false);
    }
  };
  const archiveProgress = (message: string, percent: number) => {
    setArchiveStatus(message);
    setArchivePercent(percent);
  };
  const backupProject = (projectId: string) => runArchive(async () => {
    const editor = EditorCore.getInstance();
    // Include edits not yet written by the debounced autosave after exit.
    if (editor.project.getActiveOrNull()?.metadata.id === projectId) await editor.project.saveCurrentProject();
    const project = await editor.adapters.projectStorage.loadProject(projectId);
    if (!project) throw new Error('This project no longer exists in browser storage.');
    const blob = await createProjectArchive(project, archiveProgress);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(project.name || 'Untitled project').replace(/[^a-z0-9_-]/gi, '_').slice(0, 100)}.studiocut`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setArchiveStatus('Backup download started. Keep the .studiocut file somewhere safe.');
  });
  const restoreProject = (file: File) => runArchive(async () => {
    await restoreProjectArchive(file, EditorCore.getInstance().adapters.projectStorage, archiveProgress);
    setProjects(await EditorCore.getInstance().project.listProjects());
  });

  useEffect(() => {
    let current = true;
    EditorCore.getInstance().project.listProjects()
      .then((items) => {
        if (current) setProjects(items);
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : 'Could not read local projects.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, []);

  const createProject = async () => {
    setCreating(true);
    setError('');
    try {
      const project = await EditorCore.getInstance().adapters.projectStorage.createProject('Untitled project');
      if (!isDesktopBuild) recordUsageEvent('project_created');
      navigate(`/editor/${encodeURIComponent(project.id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a project in browser storage.');
      setCreating(false);
    }
  };

  return (
    <main className="relative h-full overflow-y-auto bg-background text-foreground">
      <div aria-hidden="true" className="library-glow pointer-events-none fixed inset-0" />
      <header className="relative mx-auto flex max-w-7xl items-center justify-between border-b border-border px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <StudioCutMark />
          <div>
            <div className="text-sm font-semibold tracking-tight text-foreground">StudioCut</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Video workspace</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <StudioThemePicker />
          <input ref={restoreInput} type="file" accept=".studiocut" aria-label="Choose project backup" className="hidden" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void restoreProject(file);
          }} />
          <button type="button" disabled={archiveBusy || creating} onClick={() => restoreInput.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:bg-secondary disabled:opacity-50">
            <Upload className="size-4" /> Import project backup
          </button>
          <button
            type="button"
            onClick={() => void createProject()}
            disabled={creating || archiveBusy}
            className="studio-accent-mark-shadow inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            <Plus className="size-4" />
            {creating ? 'Creating…' : 'New project'}
          </button>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-12 pt-10 sm:px-8 sm:pt-16">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1.5 text-[11px] font-medium tracking-wide text-primary">
            <span className="studio-accent-dot-shadow size-1.5 rounded-full bg-primary" />
              LOCAL-FIRST EDITING
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
              Your next edit,<br className="hidden sm:block" /> right where you left it.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              A complete timeline editor for video, sound, titles, effects, and more. Your projects and imported media stay {isDesktopBuild ? 'on this computer. Desktop projects are separate from your browser projects; use backups to transfer them.' : 'in this browser.'}
            </p>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-lg font-semibold text-foreground">{projects.length}</div>
              <div>saved projects</div>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-lg font-semibold text-foreground"><HardDrive className="size-4 text-primary" /> Local</div>
              <div>storage by default</div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recent projects</h2>
            <p className="mt-1 text-xs text-muted-foreground">Saved automatically on this device</p>
          </div>
          {projects.length > 0 && <span className="text-xs text-muted-foreground">{projects.length} total</span>}
        </div>

        {error && (
          <div role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Protect your work: download a backup before clearing browser data or changing devices. Backups include original imported media and stay on your device. Restore creates a new copy without replacing existing projects. Limits: 2 GB per archive, 512 MB per media file.</p>
        {archiveStatus && <div role="status" aria-live="polite" className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
          {archiveStatus}
          {archiveBusy && <progress aria-label="Backup or restore progress" max={100} value={archivePercent} className="mt-2 block h-2 w-full accent-primary" />}
        </div>}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <span className="mr-3 size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            Loading projects…
          </div>
        ) : projects.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <article key={project.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                disabled={archiveBusy}
                onClick={() => navigate(`/editor/${encodeURIComponent(project.id)}`)}
                className="group w-full text-left transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <div className="project-card-preview relative flex aspect-[16/8] items-center justify-center overflow-hidden">
                  <div className="project-card-grid absolute inset-0 opacity-60" />
                  <div className="relative grid size-12 place-items-center rounded-2xl border border-border bg-muted text-muted-foreground transition group-hover:scale-105 group-hover:text-primary">
                    <Film className="size-5" />
                  </div>
                  <span className="absolute bottom-3 left-3 rounded-md border border-border bg-background/80 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">StudioCut project</span>
                  <ArrowUpRight className="absolute right-3 top-3 size-4 text-muted-foreground/60 transition group-hover:text-primary" />
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{project.name || 'Untitled project'}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock3 className="size-3" />
                      Edited {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'recently'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/[0.1] px-2.5 py-1 text-[10px] font-medium text-primary">On this device</span>
                </div>
              </button>
              <div className="border-t border-border px-4 py-2">
                <button type="button" disabled={archiveBusy || creating} onClick={() => void backupProject(project.id)} aria-label={`Download backup of ${project.name || 'Untitled project'}`} className="inline-flex items-center gap-2 py-1 text-xs text-primary hover:underline disabled:opacity-50">
                  <Download className="size-3.5" /> Download backup
                </button>
              </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/[0.08] text-primary">
              <StudioCutMark className="size-8" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Your first sequence starts here</h3>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Bring in a video, audio track, or image, then shape your story in StudioCut.</p>
            <button type="button" onClick={() => void createProject()} disabled={creating || archiveBusy} className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:border-primary/45 hover:bg-secondary disabled:opacity-60">
              <Plus className="size-3.5" /> Create a project
            </button>
          </div>
        )}

        <footer className="mt-12 flex flex-col gap-2 border-t border-border pt-5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>StudioCut · every story starts with a cut</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {isDesktopBuild ? (
              <span>Desktop · Local projects · No account required · Back up important work</span>
            ) : (
              <>
                <Link href="/support" className="transition hover:text-primary">Support StudioCut</Link>
                <AccountNavigation />
                <a href="/classic" className="transition hover:text-primary">Open the earlier StudioCut editor</a>
                <span>Projects and imported media are stored locally in your browser.</span>
              </>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
}


function AccountNavigation() {
  const { signOut } = useClerk();
  const profile = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUserProfile,
    retry: false,
  });

  return (
    <>
      {profile.data?.isAdmin && (
        <Link href="/admin" className="transition hover:text-primary">Admin panel</Link>
      )}
      <button
        type="button"
        onClick={() => void signOut({ redirectUrl: basePath || '/' })}
        className="transition hover:text-primary"
      >
        Sign out
      </button>
    </>
  );
}

function EditorWorkspace({ adapters }: { adapters: VideoEditorAdapters }) {
  const { projectId = DEFAULT_PROJECT_ID } = useEditorParams();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setReady(false);
    setError('');
    openStudioProject(projectId, adapters)
      .then(() => { if (current) setReady(true); })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason.message : 'Could not open this project.');
      });
    return () => { current = false; };
  }, [projectId, adapters]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <div className="text-sm font-semibold">This project could not be opened</div>
        <div className="max-w-md text-xs leading-5 text-muted-foreground">{error}</div>
        <a href="/projects" className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Back to projects</a>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        Opening your project…
      </div>
    );
  }

  return (
    <VideoEditor
      adapters={adapters}
      exitTo="/projects"
      headerEndSlot={<StudioThemePicker />}
    />
  );
}

function openStudioProject(projectId: string, adapters: VideoEditorAdapters): Promise<void> {
  const inFlight = projectsOpening.get(projectId);
  if (inFlight) return inFlight;

  const opening = projectOpenQueue.then(async () => {
    const editor = EditorCore.initialize({ adapters });
    const savedEnvelope = await editor.adapters.projectStorage.loadProject(projectId);
    const project = await editor.project.openProject({ id: projectId });
    if (project) return;

    const scene = buildDefaultScene({ name: 'Main scene', isMain: true });
    const now = new Date();
    const initialProject: TProject = {
      metadata: {
        id: projectId,
        name: savedEnvelope?.name || 'Untitled project',
        duration: ZERO_MEDIA_TIME,
        createdAt: now,
        updatedAt: now,
      },
      scenes: [scene],
      currentSceneId: scene.id,
      settings: {
        fps: { numerator: 30, denominator: 1 } as never,
        canvasSize: { width: 1920, height: 1080 },
        background: { type: 'color', color: '#111316' },
      },
      version: 1,
    };
    editor.project.setActiveProject({ project: initialProject });
    editor.scenes.initializeScenes({ scenes: initialProject.scenes, currentSceneId: initialProject.currentSceneId });
    editor.save.start();
    await editor.project.saveCurrentProject();
  });

  projectsOpening.set(projectId, opening);
  projectOpenQueue = opening.catch(() => undefined);
  const clearPending = () => {
    if (projectsOpening.get(projectId) === opening) projectsOpening.delete(projectId);
  };
  void opening.then(clearPending, clearPending);
  return opening;
}

function StudioEditor() {
  const [project, setProject] = useState<Project>(initialProject);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState('');
  const [assetTab, setAssetTab] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [importHover, setImportHover] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportQuality, setExportQuality] = useState<'standard' | 'high'>('high');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const history = useRef<Snapshot>({ past: [], future: [] });
  const projectRef = useRef(project);
  const timeRef = useRef(currentTime);
  const urlsRef = useRef(urls);
  projectRef.current = project;
  timeRef.current = currentTime;
  urlsRef.current = urls;

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 3100);
  }, []);
  const changeProject = useCallback((update: (before: Project) => Project) => {
    const before = projectRef.current;
    history.current.past = [...history.current.past.slice(-39), before];
    history.current.future = [];
    const next = update(before);
    projectRef.current = next;
    setProject(next);
    setSaved(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const savedProject = await dbRequest<Project | undefined>('projects', 'readonly', (store) => store.get(PROJECT_KEY));
        const blobs = await dbRequest<{ id: string; blob: Blob }[]>('media', 'readonly', (store) => store.getAll());
        if (!active) return;
        const restored = savedProject ?? initialProject;
        const nextUrls: Record<string, string> = {};
        for (const item of blobs) nextUrls[item.id] = URL.createObjectURL(item.blob);
        setProject(restored);
        projectRef.current = restored;
        setUrls(nextUrls);
        setReady(true);
      } catch {
        if (active) { setReady(true); notify('Local project storage is unavailable in this browser.', true); }
      }
    })();
    return () => {
      active = false;
      Object.values(urlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [notify]);

  useEffect(() => {
    if (!ready) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      dbRequest('projects', 'readwrite', (store) => store.put(project, PROJECT_KEY))
        .then(() => setSaved(true))
        .catch(() => notify('Could not save this project locally.', true));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [project, ready, notify]);

  const assetById = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const sortedClips = useMemo(() => [...project.clips].sort((a, b) => a.start - b.start), [project.clips]);
  const projectDuration = Math.max(0, ...project.clips.map((clip) => clip.start + clip.duration));
  const timelineWidth = Math.max(900, (projectDuration + 18) * BASE_TIMELINE_PIXELS_PER_SECOND * zoom);
  const selectedClip = project.clips.find((clip) => clip.id === selectedId) ?? null;
  const visualClip = [...project.clips]
    .filter((clip) => (clip.track === 'video' || clip.track === 'overlay') && clip.kind !== 'audio' && clip.kind !== 'title' && currentTime >= clip.start && currentTime < clip.start + clip.duration)
    .sort((a, b) => (b.track === 'overlay' ? 1 : 0) - (a.track === 'overlay' ? 1 : 0))[0] ?? null;
  const activeAudio = project.clips.find((clip) => clip.track === 'audio' && currentTime >= clip.start && currentTime < clip.start + clip.duration) ?? null;
  const currentAsset = visualClip?.assetId ? assetById.get(visualClip.assetId) : undefined;
  const currentUrl = visualClip?.assetId ? urls[visualClip.assetId] : undefined;
  const activeTitle = project.clips.find((clip) => clip.kind === 'title' && clip.track === 'overlay' && currentTime >= clip.start && currentTime < clip.start + clip.duration);
  const scale = BASE_TIMELINE_PIXELS_PER_SECOND * zoom;

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || currentAsset?.kind !== 'video' || !currentUrl || !visualClip) return;
    const target = visualClip.sourceOffset + Math.max(0, currentTime - visualClip.start);
    if (Math.abs(video.currentTime - target) > 0.12) {
      try { video.currentTime = target; } catch { /* metadata is still loading */ }
    }
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [currentAsset, currentUrl, visualClip, currentTime, playing]);

  useEffect(() => {
    const audio = audioPreviewRef.current;
    const audioAsset = activeAudio?.assetId ? assetById.get(activeAudio.assetId) : undefined;
    const audioUrl = activeAudio?.assetId ? urls[activeAudio.assetId] : undefined;
    if (!audio || !audioUrl || !activeAudio || audioAsset?.kind !== 'audio') {
      if (audio) audio.pause();
      return;
    }
    if (audio.src !== audioUrl) audio.src = audioUrl;
    const target = activeAudio.sourceOffset + currentTime - activeAudio.start;
    if (Math.abs(audio.currentTime - target) > 0.2) {
      try { audio.currentTime = target; } catch { /* metadata is still loading */ }
    }
    if (playing) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [activeAudio, assetById, urls, currentTime, playing]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last >= 33) {
        const elapsed = (now - last) / 1000;
        last = now;
        const next = Math.min(projectDuration, timeRef.current + elapsed);
        setCurrentTime(next);
        if (next >= projectDuration) setPlaying(false);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, projectDuration]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (event.code === 'Space') { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key.toLowerCase() === 's') splitSelected();
      if (event.key === 'Delete' || event.key === 'Backspace') removeSelected();
      if (event.key === 'ArrowLeft') setCurrentTime((time) => Math.max(0, time - 1 / project.fps));
      if (event.key === 'ArrowRight') setCurrentTime((time) => Math.min(projectDuration, time + 1 / project.fps));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const undo = useCallback(() => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(projectRef.current);
    setProject(previous);
    projectRef.current = previous;
    setSaved(false);
  }, []);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(projectRef.current);
    setProject(next);
    projectRef.current = next;
    setSaved(false);
  }, []);

  const addAssetClip = useCallback((asset: Asset, at?: number) => {
    const start = at ?? Math.max(0, ...projectRef.current.clips.filter((clip) => clip.track === (asset.kind === 'audio' ? 'audio' : 'video')).map((clip) => clip.start + clip.duration));
    const clip: Clip = {
      id: newId(), assetId: asset.id, kind: asset.kind, name: asset.name,
      track: asset.kind === 'audio' ? 'audio' : 'video',
      start, duration: Math.max(0.25, asset.duration || 5), sourceOffset: 0,
    };
    changeProject((before) => ({ ...before, clips: [...before.clips, clip] }));
    setSelectedId(clip.id);
    setCurrentTime(start);
  }, [changeProject]);

  const importFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    let importedCount = 0;
    const unsupportedFiles: string[] = [];
    const failedFiles: string[] = [];
    for (const file of files) {
      const detected = getFileMediaType(file);
      if (!detected) { unsupportedFiles.push(file.name); continue; }
      const id = newId();
      const mediaBlob = file.type === detected.mime ? file : file.slice(0, file.size, detected.mime);
      const url = URL.createObjectURL(mediaBlob);
      const mediaInfo = await getMediaDuration(detected.kind, url);
      const asset: Asset = { id, name: file.name, kind: detected.kind, duration: mediaInfo.duration, size: file.size, mime: detected.mime, width: mediaInfo.width, height: mediaInfo.height };
      try {
        await dbRequest('media', 'readwrite', (store) => store.put({ id, blob: mediaBlob }));
        setUrls((before) => ({ ...before, [id]: url }));
        changeProject((before) => ({ ...before, assets: [...before.assets, asset] }));
        addAssetClip(asset);
        importedCount += 1;
      } catch {
        URL.revokeObjectURL(url);
        failedFiles.push(file.name);
      }
    }
    if (!files.length) return;
    const issueCount = unsupportedFiles.length + failedFiles.length;
    if (importedCount && issueCount) {
      notify(`${importedCount} imported; ${issueCount} could not be added. Check the file type and available browser storage.`, true);
    } else if (importedCount) {
      notify(`${importedCount} item${importedCount === 1 ? '' : 's'} added to your project`);
    } else if (failedFiles.length) {
      notify('The selected media could not be saved. Check available browser storage and try a smaller file.', true);
    } else if (unsupportedFiles.length) {
      notify(`Unsupported media file${unsupportedFiles.length === 1 ? '' : 's'}: ${unsupportedFiles.slice(0, 2).join(', ')}`, true);
    }
  }, [addAssetClip, changeProject, notify]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    changeProject((before) => ({ ...before, clips: before.clips.filter((clip) => clip.id !== selectedId) }));
    setSelectedId(null);
  }, [changeProject, selectedId]);
  const splitSelected = useCallback(() => {
    const clip = projectRef.current.clips.find((item) => item.id === selectedId);
    if (!clip || currentTime <= clip.start + 0.05 || currentTime >= clip.start + clip.duration - 0.05) {
      notify('Place the playhead inside a clip to split it.', true);
      return;
    }
    const leftDuration = currentTime - clip.start;
    const right: Clip = { ...clip, id: newId(), start: currentTime, duration: clip.duration - leftDuration, sourceOffset: clip.sourceOffset + leftDuration, name: `${clip.name} · split` };
    changeProject((before) => ({ ...before, clips: before.clips.map((item) => item.id === clip.id ? { ...item, duration: leftDuration } : item).concat(right) }));
    setSelectedId(right.id);
  }, [changeProject, currentTime, notify, selectedId]);
  const addTitle = useCallback(() => {
    const clip: Clip = { id: newId(), kind: 'title', name: 'Title overlay', track: 'overlay', start: currentTime, duration: 4, sourceOffset: 0, text: 'Your title here' };
    changeProject((before) => ({ ...before, clips: [...before.clips, clip] }));
    setSelectedId(clip.id);
  }, [changeProject, currentTime]);

  const updateClip = (id: string, update: Partial<Clip>) => changeProject((before) => ({ ...before, clips: before.clips.map((clip) => clip.id === id ? { ...clip, ...update } : clip) }));
  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.timeline-clip')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left + event.currentTarget.scrollLeft - 104;
    setCurrentTime(Math.max(0, Math.min(projectDuration, x / scale)));
  };

  const startClipDrag = (event: React.PointerEvent<HTMLDivElement>, clip: Clip, mode: 'move' | 'left' | 'right') => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(clip.id);
    const startX = event.clientX;
    const original = { ...clip };
    const beforeProject = projectRef.current;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / scale;
      let patch: Partial<Clip>;
      if (mode === 'move') patch = { start: Math.max(0, original.start + delta) };
      else if (mode === 'right') patch = { duration: Math.max(0.25, original.duration + delta) };
      if (mode === 'left') {
        const cut = Math.min(original.duration - 0.25, Math.max(-original.start, delta));
        patch = { start: original.start + cut, duration: original.duration - cut, sourceOffset: Math.max(0, original.sourceOffset + cut) };
      }
      const before = projectRef.current;
      const next = { ...before, clips: before.clips.map((item) => item.id === clip.id ? { ...item, ...patch } : item) };
      projectRef.current = next;
      setProject(next);
      setSaved(false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const moved = projectRef.current.clips.find((item) => item.id === clip.id);
      if (moved && (moved.start !== original.start || moved.duration !== original.duration || moved.sourceOffset !== original.sourceOffset)) {
        history.current.past = [...history.current.past.slice(-39), beforeProject];
        history.current.future = [];
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const exportVideo = async () => {
    const clips = projectRef.current.clips;
    const length = Math.max(0.1, ...clips.map((clip) => clip.start + clip.duration));
    if (!clips.length) { notify('Add a clip before exporting.', true); return; }
    if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
      notify('Video export is not supported in this browser. Try Chrome or Edge.', true);
      return;
    }
    setExporting(true);
    setExportProgress(0);
    const [width, height] = projectRef.current.aspect === '9:16' ? [720, 1280] : projectRef.current.aspect === '1:1' ? [1080, 1080] : [1280, 720];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) { setExporting(false); notify('Could not create the video renderer.', true); return; }
    const stream = canvas.captureStream(projectRef.current.fps || 30);
    let audioContext: AudioContext | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    const sources: AudioBufferSourceNode[] = [];
    try {
      const audioClips = clips.filter((clip) => clip.kind === 'audio' && clip.assetId);
      if (audioClips.length) {
        audioContext = new AudioContext();
        audioDestination = audioContext.createMediaStreamDestination();
        for (const clip of audioClips) {
          const blob = await dbRequest<{ id: string; blob: Blob } | undefined>('media', 'readonly', (store) => store.get(clip.assetId!));
          if (!blob) continue;
          const buffer = await audioContext.decodeAudioData(await blob.blob.arrayBuffer());
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioDestination);
          const start = Math.max(0, clip.start);
          const offset = Math.max(0, clip.sourceOffset + Math.max(0, -clip.start));
          const available = Math.min(clip.duration, Math.max(0, buffer.duration - offset));
          if (available > 0) source.start(audioContext.currentTime + start, offset, available);
          sources.push(source);
        }
        audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
        await audioContext.resume();
      }
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: exportQuality === 'high' ? 5_000_000 : 2_500_000 } : undefined);
      const chunks: BlobPart[] = [];
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => reject(new Error('The browser could not encode this project.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      });
      const videos = new Map<string, HTMLVideoElement>();
      const images = new Map<string, HTMLImageElement>();
      for (const asset of projectRef.current.assets) {
        const url = urlsRef.current[asset.id];
        if (!url) continue;
        if (asset.kind === 'video') {
          const video = document.createElement('video');
          video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
          videos.set(asset.id, video);
        } else if (asset.kind === 'image') {
          const image = new Image(); image.src = url; images.set(asset.id, image);
        }
      }
      const drawFrame = (time: number) => {
        context.fillStyle = '#0b0d10';
        context.fillRect(0, 0, width, height);
          const active = [...clips].filter((clip) => clip.kind !== 'audio' && clip.kind !== 'title' && clip.assetId && time >= clip.start && time < clip.start + clip.duration && (clip.track === 'video' || clip.track === 'overlay')).sort((a, b) => (b.track === 'overlay' ? 1 : 0) - (a.track === 'overlay' ? 1 : 0))[0];
        if (active?.assetId) {
          const asset = assetById.get(active.assetId);
          const source = asset?.kind === 'video' ? videos.get(active.assetId) : images.get(active.assetId);
          if (source && source instanceof HTMLVideoElement && source.readyState >= 2) {
            const target = active.sourceOffset + time - active.start;
            if (Math.abs(source.currentTime - target) > 0.08) { try { source.currentTime = target; } catch { /* waiting for seekable data */ } }
            const ratio = Math.min(width / source.videoWidth, height / source.videoHeight);
            const w = source.videoWidth * ratio, h = source.videoHeight * ratio;
            context.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
          } else if (source instanceof HTMLImageElement && source.complete && source.naturalWidth) {
            const ratio = Math.min(width / source.naturalWidth, height / source.naturalHeight);
            const w = source.naturalWidth * ratio, h = source.naturalHeight * ratio;
            context.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
          }
        }
        const title = clips.find((clip) => clip.kind === 'title' && time >= clip.start && time < clip.start + clip.duration);
        if (title?.text) {
          context.fillStyle = '#ffffff';
          context.font = `700 ${Math.round(width * 0.052)}px "DM Sans", sans-serif`;
          context.textAlign = 'center'; context.textBaseline = 'middle';
          context.shadowColor = '#000'; context.shadowBlur = 16;
          context.fillText(title.text, width / 2, height / 2, width * 0.84);
          context.shadowBlur = 0;
        }
      };
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      drawFrame(0);
      recorder.start(250);
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const render = (now: number) => {
          const time = Math.min(length, (now - started) / 1000);
          drawFrame(time);
          setExportProgress(Math.min(99, Math.round(time / length * 100)));
          if (time >= length) resolve();
          else requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
      });
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      recorder.stop();
      const output = await finished;
      const downloadUrl = URL.createObjectURL(output);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${projectRef.current.name.trim().replace(/[^\w-]+/g, '-') || 'studiocut-export'}.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 3000);
      setExportProgress(100);
      notify('Your WebM export is ready.');
      setExportOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Export failed. Try a shorter timeline.', true);
    } finally {
      sources.forEach((source) => { try { source.stop(); } catch { /* already ended */ } });
      stream.getTracks().forEach((track) => track.stop());
      if (audioContext) void audioContext.close();
      setExporting(false);
    }
  };

  const filteredAssets = project.assets.filter((asset) => (assetTab === 'all' || asset.kind === assetTab) && asset.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <main className="studio">
      <header className="topbar">
        <div className="brand"><StudioCutMark className="size-[27px]" /><span>StudioCut</span></div>
        <input aria-label="Project name" className="project-name" value={project.name} onChange={(event) => changeProject((before) => ({ ...before, name: event.target.value }))} />
        <div className="saved-state" data-testid="status-project-save">{ready && saved ? <Check size={13} /> : <Clock3 size={12} />}{!ready ? 'Opening local project…' : saved ? 'Saved locally' : 'Saving…'}</div>
        <div className="top-spacer" />
        <button className="icon-button" aria-label="Undo" title="Undo · Ctrl Z" onClick={undo} disabled={!history.current.past.length}><Undo2 /></button>
        <button className="icon-button" aria-label="Redo" title="Redo · Ctrl Shift Z" onClick={redo} disabled={!history.current.future.length}><Redo2 /></button>
        <button className="quiet-button" onClick={() => dbRequest('projects', 'readwrite', (store) => store.put(projectRef.current, PROJECT_KEY)).then(() => { setSaved(true); notify('Project saved on this device.'); }).catch(() => notify('Could not save locally.', true))}><Check size={13} /> Save</button>
        <button className="primary-button" onClick={() => setExportOpen(true)}><Download /> Export</button>
      </header>
      <section className="workspace">
        <aside className="panel library">
          <div className="panel-head"><span className="panel-title">Project media</span><div className="panel-tools"><button className="icon-button" aria-label="Import media" title="Import media" onClick={() => fileInputRef.current?.click()}><Plus /></button><button className="icon-button" aria-label="Add title" title="Add title" onClick={addTitle}><Type /></button></div></div>
          <div className="library-tabs">
            {(['all', 'video', 'audio', 'image'] as const).map((tab) => <button className={`library-tab ${assetTab === tab ? 'active' : ''}`} key={tab} onClick={() => setAssetTab(tab)}>{tab === 'all' ? 'All media' : `${tab[0].toUpperCase()}${tab.slice(1)}`}</button>)}
          </div>
          <div className="library-search"><Search /><input aria-label="Search media" placeholder="Find in project…" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
          <button className={`import-box ${importHover ? 'dragging' : ''}`} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setImportHover(true); }} onDragLeave={() => setImportHover(false)} onDrop={(event) => { event.preventDefault(); setImportHover(false); void importFiles(event.dataTransfer.files); }}>
            <Upload /><strong>Import your media</strong><span>Video, audio, and images stay on this device</span>
          </button>
          <input ref={fileInputRef} className="hidden-input" type="file" accept="video/*,audio/*,image/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.mp3,.m4a,.wav,.ogg,.flac,.jpg,.jpeg,.png,.gif,.webp,.avif,.bmp" multiple onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
          <div className="asset-list">
            {filteredAssets.map((asset) => <div className="asset-row" key={asset.id} onDoubleClick={() => addAssetClip(asset)}>
              <div className="asset-thumb">{asset.kind === 'image' && urls[asset.id] ? <img src={urls[asset.id]} alt="" /> : asset.kind === 'video' ? <FileVideo /> : <FileAudio />}</div>
              <div className="asset-copy"><div className="asset-name">{asset.name}</div><div className="asset-meta">{formatTime(asset.duration)} · {formatBytes(asset.size)}</div></div>
              <button className="asset-add" aria-label={`Add ${asset.name} to timeline`} title="Add to timeline" onClick={() => addAssetClip(asset)}><Plus /></button>
            </div>)}
            {!filteredAssets.length && <div className="empty-assets"><strong>{project.assets.length ? 'No matching media' : 'A clean slate.'}</strong>{project.assets.length ? 'Try another search or media filter.' : 'Drop your first footage here. StudioCut keeps every byte on this device.'}</div>}
          </div>
        </aside>

        <section className="panel preview-panel">
          <div className="panel-head preview-head"><span className="panel-title">Preview</span><div className="panel-tools"><select aria-label="Canvas aspect ratio" className="aspect-select" value={project.aspect} onChange={(event) => changeProject((before) => ({ ...before, aspect: event.target.value as Project['aspect'] }))}><option value="16:9">16:9 Landscape</option><option value="9:16">9:16 Portrait</option><option value="1:1">1:1 Square</option></select><button className="icon-button" aria-label="Jump to start" title="Go to start" onClick={() => setCurrentTime(0)}><SkipBack /></button><button className="icon-button" aria-label="Fit preview" title="Fit preview" onClick={() => notify('Preview is fitted to the available canvas.')}><Maximize2 /></button></div></div>
          <div className="preview-stage">
            <div className={`preview-frame ${project.aspect === '9:16' ? 'ratio-vertical' : project.aspect === '1:1' ? 'ratio-square' : ''}`}>
              {currentAsset?.kind === 'video' && currentUrl && visualClip && <video ref={previewVideoRef} src={currentUrl} playsInline preload="metadata" aria-label="Timeline video preview" />}
              {currentAsset?.kind === 'image' && currentUrl && <img src={currentUrl} alt={currentAsset.name} />}
              {!visualClip && <div className="preview-empty"><div className="preview-empty-mark"><Film /></div><span>{project.clips.length ? 'Move the playhead over a clip to preview' : 'Your story starts with a clip'}</span></div>}
              {activeTitle && <div className="preview-title">{activeTitle.text}</div>}
              <audio ref={audioPreviewRef} />
            </div>
          </div>
          <div className="transport">
            <button aria-label="Back one second" title="Back one second" onClick={() => setCurrentTime((time) => Math.max(0, time - 1))}><SkipBack /></button>
            <button className="play" aria-label={playing ? 'Pause' : 'Play'} title="Play / pause · Space" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause /> : <Play />}</button>
            <button aria-label="Forward one second" title="Forward one second" onClick={() => setCurrentTime((time) => Math.min(projectDuration, time + 1))}><SkipForward /></button>
            <span className="time-readout">{formatTime(currentTime)} <span className="time-divider">/</span> {formatTime(projectDuration)}</span>
          </div>
        </section>

        <aside className="panel properties">
          <div className="panel-head"><span className="panel-title">Inspector</span><Settings2 size={14} className="text-muted-foreground" /></div>
          <div className="properties-content">
            {selectedClip ? <>
              <div className="selection-card"><div className="selection-name">{selectedClip.name}</div><div className="selection-type">{selectedClip.kind === 'title' ? 'Text overlay' : `${selectedClip.kind[0].toUpperCase()}${selectedClip.kind.slice(1)} clip`} · {selectedClip.track} track</div></div>
              {selectedClip.kind === 'title' && <><label className="field-label" htmlFor="title-copy">TITLE TEXT</label><input id="title-copy" className="field-input" value={selectedClip.text ?? ''} onChange={(event) => updateClip(selectedClip.id, { text: event.target.value, name: event.target.value || 'Title overlay' })} /></>}
              <div className="field-grid">
                <div><label className="field-label" htmlFor="clip-start">START</label><input id="clip-start" className="field-input" type="number" min="0" step="0.1" value={selectedClip.start.toFixed(2)} onChange={(event) => updateClip(selectedClip.id, { start: Math.max(0, Number(event.target.value) || 0) })} /></div>
                <div><label className="field-label" htmlFor="clip-duration">DURATION</label><input id="clip-duration" className="field-input" type="number" min="0.25" step="0.1" value={selectedClip.duration.toFixed(2)} onChange={(event) => updateClip(selectedClip.id, { duration: Math.max(0.25, Number(event.target.value) || 0.25) })} /></div>
              </div>
              {selectedClip.kind !== 'title' && <><label className="field-label" htmlFor="clip-offset">SOURCE IN</label><input id="clip-offset" className="field-input" type="number" min="0" step="0.1" value={selectedClip.sourceOffset.toFixed(2)} onChange={(event) => updateClip(selectedClip.id, { sourceOffset: Math.max(0, Number(event.target.value) || 0) })} /></>}
              <div className="property-note">Drag the clip edges to trim. Move the clip body to reposition it. Edits are saved locally as you work.</div>
            </> : <div className="inspector-empty"><Sparkles size={16} className="text-primary" style={{ display: 'block', marginBottom: 10 }} />Select a clip to adjust its timing and content. Set your canvas ratio above before you start shaping the frame.</div>}
          </div>
        </aside>

        <section className="panel timeline-panel">
          <div className="timeline-toolbar">
            <span className="panel-title">Timeline</span><span className="tool-divider" />
            <button className="tool-button" title="Undo · Ctrl Z" aria-label="Undo edit" onClick={undo} disabled={!history.current.past.length}><Undo2 /></button>
            <button className="tool-button" title="Redo · Ctrl Shift Z" aria-label="Redo edit" onClick={redo} disabled={!history.current.future.length}><Redo2 /></button>
            <span className="tool-divider" />
            <button className="tool-button" title="Split clip at playhead · S" aria-label="Split selected clip" onClick={splitSelected} disabled={!selectedClip}><Scissors /> Split</button>
            <button className="tool-button" title="Delete selected clip · Delete" aria-label="Remove selected clip" onClick={removeSelected} disabled={!selectedClip}><Trash2 /></button>
            <button className="tool-button" title="Add a title overlay" aria-label="Add title track clip" onClick={addTitle}><Type /></button>
            <span className="timeline-spacer" />
            <button className="tool-button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.35, Number((value - 0.15).toFixed(2))))}><ZoomOut /></button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="tool-button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2.6, Number((value + 0.15).toFixed(2))))}><ZoomIn /></button>
          </div>
          <div className="timeline-scroll" ref={timelineRef} onPointerDown={seekFromPointer}>
            {project.clips.length === 0 ? <div className="timeline-empty">Add media above, or <button onClick={() => fileInputRef.current?.click()}>import a clip</button> to begin your timeline.</div> : <div style={{ width: timelineWidth, position: 'relative', minHeight: 218 }}>
              <div className="ruler"><div className="ruler-inner" style={{ width: timelineWidth }}>
                {Array.from({ length: Math.ceil(timelineWidth / (scale * 5)) + 1 }, (_, index) => <div className="tick" key={index} style={{ left: index * scale * 5 }}>{formatTime(index * 5).slice(0, 5)}</div>)}
              </div></div>
              {([
                { id: 'video', name: 'Video 01', icon: <Film /> },
                { id: 'overlay', name: 'Overlay', icon: <Type /> },
                { id: 'audio', name: 'Audio 01', icon: <Volume2 /> },
              ] as const).map((track) => <div className="track-row" key={track.id}>
                <div className="track-label">{track.icon}<span>{track.name}</span></div>
                <div className="track-content" style={{ width: timelineWidth - 104 }} onPointerDown={(event) => { if ((event.target as HTMLElement).closest('.timeline-clip')) return; }}>
                  {sortedClips.filter((clip) => clip.track === track.id).map((clip) => (
                    <div key={clip.id} className={`timeline-clip ${clip.kind === 'audio' ? 'audio' : ''} ${clip.kind === 'title' ? 'title-clip' : ''} ${selectedId === clip.id ? 'selected' : ''}`} style={{ left: clip.start * scale, width: Math.max(34, clip.duration * scale) }} onPointerDown={(event) => startClipDrag(event, clip, 'move')} onClick={(event) => { event.stopPropagation(); setSelectedId(clip.id); }} title={`${clip.name} · ${formatTime(clip.duration)}`}>
                      {clip.kind === 'audio' && <div className="clip-wave" />}
                      <div className="clip-handle left" onPointerDown={(event) => startClipDrag(event, clip, 'left')} />
                      <div className="clip-name">{clip.name}</div><div className="clip-sub">{formatTime(clip.duration)}</div>
                      <div className="clip-handle right" onPointerDown={(event) => startClipDrag(event, clip, 'right')} />
                    </div>
                  ))}
                </div>
              </div>)}
              <div className="playhead" style={{ left: 104 + currentTime * scale }} />
            </div>}
          </div>
          <div className="timeline-status">{project.clips.length} clip{project.clips.length === 1 ? '' : 's'} <span className="time-divider">·</span> {formatTime(projectDuration)} <span className="time-divider">·</span> {project.fps} fps <span className="time-divider">·</span> Space play/pause <span className="time-divider">·</span> S split</div>
        </section>
      </section>
      {exportOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) setExportOpen(false); }}>
        <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
          <div className="dialog-head"><h2 id="export-title">Export your cut</h2><button className="icon-button" aria-label="Close export settings" onClick={() => setExportOpen(false)} disabled={exporting}><X /></button></div>
          <div className="dialog-body">
            <div className="export-summary"><strong>{project.name || 'Untitled film'}</strong><br />WebM video · {project.aspect} · {project.fps} fps · {formatTime(projectDuration)}<br />Rendered in this browser. Your original media never leaves this device.</div>
            <label className="field-label" htmlFor="export-quality">VIDEO QUALITY</label>
            <select id="export-quality" className="field-select" value={exportQuality} onChange={(event) => setExportQuality(event.target.value as 'standard' | 'high')} disabled={exporting}><option value="standard">Standard · 2.5 Mbps</option><option value="high">High · 5 Mbps</option></select>
            {exporting && <><div className="field-label">RENDERING · {exportProgress}%</div><div className="progress-track"><div className="progress-fill" style={{ width: `${exportProgress}%` }} /></div></>}
            <div className="property-note">The browser encoder produces a playable .webm file in real time. Separate audio-track clips are included; audio embedded in video clips is not mixed into this export yet.</div>
          </div>
          <div className="dialog-actions"><button className="quiet-button" onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</button><button className="primary-button" onClick={() => void exportVideo()} disabled={exporting || !project.clips.length}>{exporting ? <><Clock3 size={14} /> Rendering…</> : <><Download /> Export WebM</>}</button></div>
        </section>
      </div>}
      {toast && <div className={`toast-message ${toast.error ? 'error' : ''}`} role="status">{toast.text}</div>}
    </main>
  );
}

export default App;
