import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FormField from '../components/FormField';
import AlertBanner from '../components/AlertBanner';

interface Fields {
  email: string;
  password: string;
}

interface FieldErrors extends Partial<Fields> {}

function validate(f: Fields): FieldErrors {
  const e: FieldErrors = {};
  if (!f.email.trim()) e.email = 'Email is required';
  if (!f.password) e.password = 'Password is required';
  return e;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [fields, setFields] = useState<Fields>({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError('');

    const errors = validate(fields);
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await login(fields.email, fields.password);
      // Redirect to the page the user tried to access, or /dashboard
      const from = (location.state as any)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Invalid email or password.';
      setServerError(Array.isArray(msg) ? msg.join('. ') : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sign in</h1>
          <p className="mt-2 text-sm text-gray-500">
            Welcome back — enter your credentials to continue
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5"
        >
          {serverError && <AlertBanner message={serverError} />}

          <FormField
            label="Email"
            id="email"
            type="email"
            value={fields.email}
            onChange={set('email')}
            error={fieldErrors.email}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <FormField
            label="Password"
            id="password"
            type="password"
            value={fields.password}
            onChange={set('password')}
            error={fieldErrors.password}
            placeholder="Your password"
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-sm text-gray-500">
            New here?{' '}
            <Link to="/register" className="text-blue-600 hover:underline font-medium">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
