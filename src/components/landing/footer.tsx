import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-gray-900 py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
                CB
              </div>
              <span className="font-semibold text-white text-lg">Coverboard</span>
            </div>
            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
              Staff cover software for shift-based teams. Know who&apos;s off, where you&apos;re short, and who can help cover.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-white mb-3">Product</p>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="/#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/guides" className="hover:text-white transition-colors">Guides</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-3">Account</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/login" className="hover:text-white transition-colors">Log in</Link></li>
                <li><Link href="/signup" className="hover:text-white transition-colors">Sign up</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-3">Legal</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 text-center text-sm text-gray-500 space-y-2">
          <p>
            UK-resident data &mdash; stored in London on AWS{" "}
            <code className="font-mono text-xs">eu-west-2</code> via Supabase.
            Compliant with the UK GDPR.
          </p>
          <p>
            &copy; {new Date().getFullYear()} Coverboard. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
