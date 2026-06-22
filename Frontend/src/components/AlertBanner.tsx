interface Props {
  message: string;
  variant?: 'error' | 'success';
}

export default function AlertBanner({ message, variant = 'error' }: Props) {
  const styles =
    variant === 'error'
      ? 'bg-red-50 border-red-300 text-red-700'
      : 'bg-green-50 border-green-300 text-green-700';

  return (
    <div className={`px-4 py-3 rounded-lg border text-sm ${styles}`}>
      {message}
    </div>
  );
}
