import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const WHATSAPP_NUMBER = 'YOUR_NUMBER' // Replace with real number e.g. 15551234567
const CONTACT_EMAIL = 'your@email.com' // Replace with real email

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    features: [
      '5 generations / month',
      '3 projects',
      'Basic research',
      'All 4 platforms',
    ],
    popular: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/mo',
    features: [
      '100 generations / month',
      'Unlimited projects',
      'Priority research',
      'All 4 platforms',
      'Email support',
    ],
    popular: true,
  },
  {
    key: 'agency',
    name: 'Agency',
    price: '$99',
    period: '/mo',
    features: [
      'Unlimited generations',
      'Unlimited projects',
      'Video generation',
      'API access',
      'Priority support',
      'Custom integrations',
    ],
    popular: false,
  },
]

export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: userRow } = await supabase
    .from('users')
    .select('plan')
    .eq('id', user!.id)
    .single()
  const currentPlan = userRow?.plan ?? 'free'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Upgrade Your Plan</h1>
        <p className="text-muted-foreground">
          Choose the plan that fits your content needs.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key
          const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hi! I'd like to upgrade to the ContentEngine ${plan.name} plan.`
          )}`
          const emailLink = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
            `Upgrade to ContentEngine ${plan.name} plan`
          )}`

          return (
            <Card
              key={plan.key}
              className={`relative flex flex-col ${
                plan.popular ? 'border-primary shadow-lg' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}

              <CardHeader className="pt-6">
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-6 flex-1">
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <span className="text-green-500 font-bold">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.key === 'free' ? (
                  <Button disabled={isCurrent} variant="outline" className="w-full">
                    {isCurrent ? 'Current Plan' : 'Downgrade'}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      asChild
                      variant={plan.popular ? 'default' : 'outline'}
                      className="w-full"
                    >
                      <a href={waLink} target="_blank" rel="noopener noreferrer">
                        WhatsApp Us
                      </a>
                    </Button>
                    <Button asChild variant="ghost" className="w-full">
                      <a href={emailLink}>Email Us</a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Questions? Reach out at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  )
}
