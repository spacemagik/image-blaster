import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import { Router } from 'wouter'
import { App } from './App'
import '@radix-ui/themes/styles.css'
import './index.css'

// Filter a single library-internal deprecation warning emitted by
// `@sparkjsdev/spark`'s vendored WASM bootstrap. Spark calls its own
// `__wbindgen_start` with the old positional-arg signature; the message is
// purely informational, fires once per page load, and we can't reach the call
// site from userland. We pattern-match the exact string to avoid suppressing
// any other warning that happens to share keywords.
{
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('deprecated parameters for the initialization function')) {
      return
    }
    originalWarn.apply(console, args)
  }
}

createRoot(document.getElementById('root')!).render(
  <Theme appearance="dark" hasBackground={false}>
    <Router>
      <App />
    </Router>
  </Theme>
)
