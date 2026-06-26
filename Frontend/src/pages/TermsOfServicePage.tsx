export default function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 text-gray-800">
      <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: June 26, 2026</p>

      <p className="mb-4">
        These Terms of Service ("Terms") govern your use of the sales support and customer
        management application (the "Service") operated by Belle Biz Marketing Ltd., located at
        3355 153 Ave, Edmonton, AB T5Y 4E1, Canada. By creating an account or using the Service,
        you agree to these Terms.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">1. Use of the Service</h2>
      <p className="mb-4">
        The Service is provided to help businesses manage customers, invoices, subscriptions,
        and related communications. You are responsible for the accuracy of the data you enter
        and for complying with applicable law when contacting your customers (including email
        marketing laws).
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">2. Accounts</h2>
      <p className="mb-4">
        You must keep your login credentials confidential. The business owner is responsible for
        managing staff accounts created under their business and for the permissions granted to
        them.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">3. Connected Third-Party Accounts</h2>
      <p className="mb-4">
        You may connect third-party accounts (Facebook Ads, Google Ads, Gmail) to enable optional
        features. You authorize the Service to access and use data from those accounts only for
        the purposes described in the app (syncing campaign data, sending/receiving email). You
        may disconnect these accounts at any time.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">4. AI-Assisted Analysis</h2>
      <p className="mb-4">
        Where you choose to run AI-assisted campaign analysis, a summary of your campaign data is
        sent to a third-party AI provider to generate insights. You are responsible for ensuring
        you have the right to use this feature with the data you submit.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">5. Acceptable Use</h2>
      <p className="mb-4">
        You agree not to use the Service to send unsolicited bulk email in violation of applicable
        law, to misuse connected advertising or email accounts, or to attempt to disrupt or gain
        unauthorized access to the Service.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">6. Service Availability</h2>
      <p className="mb-4">
        The Service is provided "as is" without warranties of any kind. We do not guarantee
        uninterrupted availability and may modify or discontinue features at any time.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">7. Termination</h2>
      <p className="mb-4">
        We may suspend or terminate access to the Service for accounts that violate these Terms.
        You may stop using the Service and request account deletion at any time.
      </p>

      <h2 className="text-lg font-semibold mt-6 mb-2">8. Contact</h2>
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
