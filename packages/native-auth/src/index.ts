// Sign-in shared by the Expo apps: the session provider (with the app's config), phone / Apple /
// Google actions, captcha when Supabase asks for it, and the two sign-in forms.
export {
  needsCaptcha,
  sendPhoneCode,
  signInWithApple,
  signInWithGoogle,
  signOut,
  verifyPhoneCode,
  type PhoneMode,
  type SignInResult,
} from './actions';
export { AuthProvider, useAuth, type AuthConfig, type AuthProviders } from './auth-provider';
export { parseAuthRedirect, type AuthRedirect } from './redirect';
export { SignInForm } from './sign-in-form';
export { openSitePage, SITE_PAGES, type SitePage } from './site-pages';
export { useSendCode, type SendCode } from './use-send-code';
export { VerifyForm } from './verify-form';
