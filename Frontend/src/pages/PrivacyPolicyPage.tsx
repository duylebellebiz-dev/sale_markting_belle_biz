export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 text-gray-800">
      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: June 26, 2026</p>

      <p className="mb-4">
        Belle Biz Marketing Ltd. ("we", "us", "our"), located at 3355 153 Ave, Edmonton, AB T5Y
        4E1, Canada, provides a sales support and customer management application (the
        "Service") for small and medium businesses. This Privacy Policy explains what
        information we collect, how we use it, and your choices.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">1. Information We Collect</h2>
      <ul className="list-disc pl-6 mb-4 space-y-1">
        <li>Account information: business name, email address, and password (stored as a hash).</li>
        <li>Customer and business data you enter into the Service (leads, invoices, services, subscriptions).</li>
        <li>
          If you connect a Facebook Ads or Google Ads account, we access campaign and performance
          data from that account on your behalf, using the permissions you grant during the
          connection process.
        </li>
        <li>
          If you connect a Gmail account, we access only the inbox you explicitly connect, to send
          and receive replies on your behalf.
        </li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">2. How We Use Information</h2>
      <ul className="list-disc pl-6 mb-4 space-y-1">
        <li>To provide and operate the Service (customer tracking, invoicing, reminders, email).</li>
        <li>
          To sync and display advertising campaign data from connected Facebook/Google Ads
          accounts, and to generate AI-assisted analysis of that data on your request.
        </li>
        <li>To send transactional emails (invoices, reminders, notifications) via our email provider.</li>
      </ul>

      <h2 className="text-lg font-semibold mt-6 mb-2">3. Data Sharing</h2>
      <p className="mb-4">
        We do not sell your data. We do not share your data with third parties except the service
        providers necessary to operate the Service (e.g. our hosting provider, database provider,
        and email delivery provider), and only to the extent required to provide the Service.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">4. Data Security</h2>
      <p className="mb-4">
        Passwords are hashed and never stored in plain text. Access tokens for connected
        third-party accounts (Facebook, Google, Gmail) are encrypted at rest. Access to your
        business's data is restricted to authenticated users of your business account.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">5. Data Retention &amp; Deletion</h2>
      <p className="mb-4">
        We retain your data for as long as your account is active. You may request deletion of
        your account and associated data, or disconnect any connected third-party account
        (Facebook, Google Ads, Gmail) at any time from within the app.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">6. Third-Party Platforms</h2>
      <p className="mb-4">
        If you connect Facebook Ads, Google Ads, or Gmail, your use of those platforms remains
        subject to their own privacy policies and terms. We only request the minimum permissions
        needed to provide the connected features.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">7. Contact</h2>
      <p className="mb-1">Belle Biz Marketing Ltd.</p>
      <p className="mb-1">3355 153 Ave, Edmonton, AB T5Y 4E1, Canada</p>
      <p className="mb-1">
        Hotline: +1 (587) 887 1900 |{' '}
        <a className="text-blue-600 underline" href="mailto:contact@bellebiz.com">
          contact@bellebiz.com
        </a>
      </p>
      <p className="mb-1">
        Support: +1 (587) 686 0119 |{' '}
        <a className="text-blue-600 underline" href="mailto:support@bellebiz.com">
          support@bellebiz.com
        </a>
      </p>
      <p className="mb-4">
        <a className="text-blue-600 underline" href="https://www.bellebiz.com" target="_blank" rel="noreferrer">
          www.bellebiz.com
        </a>{' '}
        |{' '}
        <a
          className="text-blue-600 underline"
          href="https://www.facebook.com/bellecheckin"
          target="_blank"
          rel="noreferrer"
        >
          facebook.com/bellecheckin
        </a>
      </p>
    </div>
  );
}
