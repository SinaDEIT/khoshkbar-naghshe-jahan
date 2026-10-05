# پنل مدیریت قیمت (مخصوص GitHub Pages)

- قیمت و لیبل‌ها در فایل `products.json` است. سایت آن را می‌خواند.
- صفحه‌ی `/admin.html` همان فایل را از طریق API گیت‌هاب ویرایش و commit می‌کند؛ گیت‌هاب پیجز خودش سایت را به‌روز می‌کند (۱ تا ۲ دقیقه).
- ورود = توکن گیت‌هاب شما. بدون توکن، صفحه فقط یک فرم خالی است.

## ساخت توکن (یک بار)
GitHub ← Settings ← Developer settings ← Personal access tokens ← **Fine-grained tokens** ← Generate:
- Repository access: **Only select repositories** ← همین ریپازیتوری
- Permissions ← Repository permissions ← **Contents: Read and write**
- مدت اعتبار: مثلاً ۹۰ روز

توکن را جای امنی نگه دارید و هیچ‌جا در ریپازیتوری ننویسید.
