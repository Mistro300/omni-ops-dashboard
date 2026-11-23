# دليل ربط ونشر OmniOps على Cloudflare Pages / Workers

تم رفع المستودع بالكامل على GitHub:
**`https://github.com/Mistro300/omni-ops-dashboard`**

كما تم إضافة ملف الإعداد [apps/web/wrangler.jsonc](../apps/web/wrangler.jsonc) وخط النشر الآلي [.github/workflows/deploy-cloudflare.yml](../.github/workflows/deploy-cloudflare.yml).

---

## الطريقة الأولى (الموصى بها): الربط المباشر من لوحة تحكم Cloudflare بـ GitHub

1. افتح لوحة تحكم Cloudflare: **[dash.cloudflare.com](https://dash.cloudflare.com)**
2. من القائمة الجانبية اختر **Compute (Workers & Pages)** ثم اضغط **Create**.
3. اختر تبويب **Pages** (أو **Import a repository**) واضغط **Connect to Git**.
4. اختر حسابك `Mistro300` والمستودع **`omni-ops-dashboard`** ثم اضغط **Begin setup**.
5. أدخل إعدادات البناء التالية للـ Monorepo:
   - **Project name:** `omni-ops-dashboard`
   - **Production branch:** `main`
   - **Root directory (مسار الجذر):** اتركه فارغاً `/` (جذر الـ Monorepo حتى يبني `packages/shared` أولاً)
   - **Build command (أمر البناء):**
     ```bash
     pnpm --filter @omni-ops/shared build && pnpm --filter @omni-ops/web build
     ```
   - **Build output directory:**
     ```text
     apps/web/.next
     ```
6. تحت قسم **Environment variables (متغيرات البيئة)** أضف:
   - `NODE_VERSION` = `22`
   - `NEXT_PUBLIC_DEMO_MODE` = `true`
   - `NEXT_PUBLIC_API_URL` = رابط الـ Backend API الخاص بك (أو `http://localhost:4000/api/v1` للتجربة المحلية)
7. اضغط **Save and Deploy**.

---

## الطريقة الثانية: النشر التلقائي عبر GitHub Actions (`deploy-cloudflare.yml`)

إذا فضّلت أن يتولى GitHub Actions النشر إلى Cloudflare تلقائياً مع كل Push:
1. من حسابك في Cloudflare، انسخ:
   - **Account ID** من الصفحة الرئيسية لحسابك.
   - **API Token** بصلاحية `Cloudflare Pages: Edit` من **My Profile -> API Tokens**.
2. افتح إعدادات المستودع على GitHub:
   `https://github.com/Mistro300/omni-ops-dashboard/settings/secrets/actions`
3. أضف الـ Secrets التالية:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
4. سيعمل الـ Workflow [deploy-cloudflare.yml](../.github/workflows/deploy-cloudflare.yml) تلقائياً عند أي تعديل على `main` أو يمكنك تشغيله يدوياً من تبويب **Actions -> Deploy Web to Cloudflare Pages -> Run workflow**.
