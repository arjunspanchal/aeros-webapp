// Friendly fallback rendered when the rate-cards read fails. Without this,
// any missing env / table / scope problem surfaces as a generic 500
// ("Application error: digest …") that doesn't tell the operator what to
// fix. Rate cards live in Supabase (via the airtableShim layer), so the
// likely failure modes are: missing Supabase env vars on Vercel, a table
// or column that hasn't been created yet, or service-role-key auth failing.

import { Card } from "@/app/calculator/_components/ui";

export default function SetupNotice({ error, isAdmin }) {
  if (!isAdmin) {
    return (
      <Card>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Rate cards aren&apos;t available for your account yet. Please reach out to your account manager.
        </p>
      </Card>
    );
  }

  const isMissingTable = /could not find table|table not found|NOT_FOUND|relation .* does not exist/i.test(error);
  const isMissingEnv = /Missing env var|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i.test(error);
  const isAuth = /(401|403|invalid|unauthorized|forbidden|jwt|service[- ]role|not authorized)/i.test(error);

  return (
    <Card>
      <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">
        Rate Cards module needs setup
      </h2>

      {isMissingEnv && (
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
          <p>A Supabase env var is missing. Set these on Vercel (Project Settings → Environment Variables):</p>
          <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
{`SUPABASE_URL=<your project URL>
SUPABASE_SERVICE_ROLE_KEY=<service role key>`}
          </pre>
          <p className="text-xs text-gray-500 dark:text-gray-400">After adding, trigger a fresh deploy on Vercel — env vars only apply to new builds.</p>
        </div>
      )}

      {isMissingTable && (
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
          <p>
            The <code>rate_cards</code> / <code>rate_card_items</code> tables don&apos;t exist
            in Supabase yet. Run the corresponding migration in
            <code className="ml-1">scripts/migrations/</code>.
          </p>
        </div>
      )}

      {isAuth && !isMissingEnv && !isMissingTable && (
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
          <p>
            Supabase rejected the request. Likely the <code>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            on Vercel doesn&apos;t match the project, or RLS on the rate-cards tables
            is denying the read (the service-role key normally bypasses RLS — verify the key
            value is correct).
          </p>
        </div>
      )}

      {!isMissingEnv && !isMissingTable && !isAuth && (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Couldn&apos;t load rate cards. Check the Supabase env vars and that the
          <code className="mx-1">rate_cards</code>/<code>rate_card_items</code> tables exist.
        </p>
      )}

      <details className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer">Raw error</summary>
        <pre className="mt-2 bg-gray-50 dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto whitespace-pre-wrap">
          {error}
        </pre>
      </details>
    </Card>
  );
}
