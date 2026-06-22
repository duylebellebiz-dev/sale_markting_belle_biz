import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FormField from '../components/FormField';
import AlertBanner from '../components/AlertBanner';

interface Fields {
  businessName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FieldErrors extends Partial<Fields> {}

function validate(f: Fields): FieldErrors {
  const e: FieldErrors = {};
  if (!f.businessName.trim()) e.businessName = 'Business name is required';
  if (!f.email.trim()) e.email = 'Email is required';
  if (f.password.length < 8) e.password = 'Password must be at least 8 characters';
  if (f.password !== f.confirmPassword) e.confirmPassword = 'Passwords do not match';
  return e;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fields, setFields] = useState<Fields>({
    businessName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
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
      await register(fields);
      navigate('/dashboard');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ?? 'Registration failed. Please try again.';
      setServerError(Array.isArray(msg) ? msg.join('. ') : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Register your business to get started
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5"
        >
          {serverError && <AlertBanner message={serverError} />}

          <FormField
            label="Business Name"
            id="businessName"
            value={fields.businessName}
            onChange={set('businessName')}
            error={fieldErrors.businessName}
            placeholder="Acme Corp"
            autoComplete="organization"
          />
          <FormField
            label="Email"
            id="email"
            type="email"
            value={fields.email}
            onChange={set('email')}
            error={fieldErrors.email}
            placeholder="owner@acme.com"
            autoComplete="email"
          />
          <FormField
            label="Password"
            id="password"
            type="password"
            value={fields.password}
            onChange={set('password')}
            error={fieldErrors.password}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <FormField
            label="Confirm Password"
            id="confirmPassword"
            type="password"
            value={fields.confirmPassword}
            onChange={set('confirmPassword')}
            error={fieldErrors.confirmPassword}
            placeholder="Repeat your password"
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
