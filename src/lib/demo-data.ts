import type { Slide, EditableField } from '@/components/slides/slide-card'

// ---------------------------------------------------------------------------
// Demo data — hardcoded TypeScript constants for the public /demo page.
// No database reads. No API calls. Everything resets on page refresh.
// ---------------------------------------------------------------------------

// Helper to generate deterministic IDs
let _id = 0
function nextId(prefix: string) {
  _id++
  return `${prefix}-${String(_id).padStart(3, '0')}`
}

// ---------------------------------------------------------------------------
// Editable field presets
// ---------------------------------------------------------------------------

function companyNameField(): EditableField {
  return { id: nextId('field'), label: 'Company Name', placeholder: 'e.g. Acme Corp', required: true }
}

function contactNameField(): EditableField {
  return { id: nextId('field'), label: 'Contact Name', placeholder: 'e.g. Jane Smith', required: true }
}

function dateField(): EditableField {
  return { id: nextId('field'), label: 'Date', placeholder: 'e.g. March 2026', required: false }
}

function customTextField(label: string, placeholder: string, required = false): EditableField {
  return { id: nextId('field'), label, placeholder, required }
}

// ---------------------------------------------------------------------------
// Demo Slides
// ---------------------------------------------------------------------------

const DEMO_TENANT_ID = 'demo-tenant-acme'

function makeSlide(
  title: string,
  status: Slide['status'],
  tags: string[],
  editableFields: EditableField[] = [],
): Slide {
  const id = nextId('slide')
  return {
    id,
    tenant_id: DEMO_TENANT_ID,
    title,
    status,
    tags,
    pptx_url: null,
    // Use gradient placeholder thumbnails — no external images needed
    thumbnail_url: null,
    editable_fields: editableFields,
    pptx_updated_at: null,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-02-20T14:30:00Z',
    created_by: null,
  }
}

// --- Group 1: Company Intro ---

const slideWelcome = makeSlide('Welcome & Agenda', 'mandatory', ['intro', 'agenda'])
const slideAboutUs = makeSlide('About Acme Corp', 'standard', ['intro', 'company'], [
  companyNameField(),
  dateField(),
])
const slideOurMission = makeSlide('Our Mission', 'standard', ['intro', 'values'])
const slideTeamOverview = makeSlide('Team Overview', 'standard', ['intro', 'team'], [
  customTextField('Team Size', 'e.g. 50+ employees', false),
])
const slideOffices = makeSlide('Global Offices', 'standard', ['intro', 'locations'])
const slideTimeline = makeSlide('Company Timeline', 'standard', ['intro', 'history'])
const slidePartners = makeSlide('Our Partners', 'standard', ['intro', 'partners'])

// --- Group 2: Products & Pricing ---

const slideProductOverview = makeSlide('Product Overview', 'standard', ['product', 'overview'])
const slideFeatureHighlight = makeSlide('Key Features', 'standard', ['product', 'features'])
const slidePricingTable = makeSlide('Pricing Plans', 'standard', ['product', 'pricing'], [
  customTextField('Discount Code', 'e.g. WELCOME10', false),
])
const slideComparison = makeSlide('Competitive Comparison', 'standard', ['product', 'comparison'])
const slideROI = makeSlide('ROI Calculator', 'standard', ['product', 'roi'], [
  companyNameField(),
  customTextField('Current Cost', 'e.g. $50,000/year', true),
])
const slideCaseStudy = makeSlide('Case Study: TechStart', 'standard', ['product', 'case-study'])
const slideTestimonials = makeSlide('Customer Testimonials', 'standard', ['product', 'social-proof'])
const slideNextSteps = makeSlide('Next Steps', 'mandatory', ['closing', 'cta'], [
  contactNameField(),
  dateField(),
])

// ---------------------------------------------------------------------------
// Demo Slide Groups
// ---------------------------------------------------------------------------

export interface DemoGroup {
  id: string
  name: string
  position: number
  slides: Slide[]
}

export const DEMO_GROUPS: DemoGroup[] = [
  {
    id: 'group-intro',
    name: 'Company Intro',
    position: 0,
    slides: [slideWelcome, slideAboutUs, slideOurMission, slideTeamOverview, slideOffices, slideTimeline, slidePartners],
  },
  {
    id: 'group-products',
    name: 'Products & Pricing',
    position: 1,
    slides: [slideProductOverview, slideFeatureHighlight, slidePricingTable, slideComparison, slideROI, slideCaseStudy, slideTestimonials, slideNextSteps],
  },
]

// Flat list for quick lookup
export const ALL_DEMO_SLIDES: Slide[] = DEMO_GROUPS.flatMap((g) => g.slides)

// Build a Map for efficient access
export const DEMO_SLIDE_MAP = new Map<string, Slide>(ALL_DEMO_SLIDES.map((s) => [s.id, s]))

// All unique tags across demo slides
export const DEMO_TAGS: string[] = [...new Set(ALL_DEMO_SLIDES.flatMap((s) => s.tags))].sort()

// Group names for filter panel
export const DEMO_GROUP_NAMES: string[] = DEMO_GROUPS.map((g) => g.name)

// ---------------------------------------------------------------------------
// Initial tray state — 3 pre-loaded slides to start
// ---------------------------------------------------------------------------

export interface DemoTrayItem {
  id: string       // instance UUID
  slide_id: string
}

export const INITIAL_TRAY_ITEMS: DemoTrayItem[] = [
  { id: 'tray-inst-1', slide_id: slideWelcome.id },
  { id: 'tray-inst-2', slide_id: slideAboutUs.id },
  { id: 'tray-inst-3', slide_id: slideNextSteps.id },
]
