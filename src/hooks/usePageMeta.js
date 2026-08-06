import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LEAGUE } from '../lib/constants.js'

/**
 * Per-route <title>, description, canonical and robots tags.
 *
 * A single-page app serves one HTML file for every URL, so without this every
 * page reports the same title and description. Google treats that as near
 * duplicate content and generally indexes only one of them — which is a large
 * part of why nothing but the home page shows up.
 *
 * Set VITE_SITE_URL in Vercel if you move to a custom domain; the fallback is
 * the current deployment.
 */
const SITE_URL = (
  import.meta.env.VITE_SITE_URL || 'https://kings-county-softball-league.vercel.app'
).replace(/\/+$/, '')

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * @param {object}  options
 * @param {string}  options.title        page name, without the league suffix
 * @param {string}  options.description  one sentence, ~150 characters
 * @param {boolean} options.noindex      true for admin screens
 */
const DEFAULT_DESCRIPTION =
  `Official site of the ${LEAGUE.name}. Game schedules, scores, standings, ` +
  'team rosters, field locations and league rules.'

export function usePageMeta({ title, description, noindex = false } = {}) {
  const { pathname } = useLocation()

  useEffect(() => {
    const fullTitle = title ? `${title} — ${LEAGUE.name}` : LEAGUE.name
    document.title = fullTitle

    // Query strings are filters, not distinct pages — canonicalise to the path
    // so /schedule?team=… doesn't compete with /schedule in the index.
    const url = `${SITE_URL}${pathname === '/' ? '/' : pathname}`

    // Always write a description. Falling back to "leave whatever is there"
    // meant a page without its own copy inherited the previously visited
    // page's description.
    const desc = description || DEFAULT_DESCRIPTION

    setMeta('name', 'description', desc)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:description', desc)

    setMeta(
      'name',
      'robots',
      noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'
    )
    setCanonical(url)
  }, [title, description, noindex, pathname])
}

export default usePageMeta
