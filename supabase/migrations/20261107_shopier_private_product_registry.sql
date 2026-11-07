-- Shopier ürün fiyatları: herkese açık 750 TL, yalnız yönetici tarafından oluşturulabilen 500 TL özel ürün.
-- Frontend'den erişim yok; sadece service_role erişebilir.
create table if not exists public.emlakcrm_shopier_product_config(
 tier text primary key check(tier in ('standard','ilyada3')),
 expected_amount_kurus integer not null,
 product_id text unique,
 product_url text,
 status text not null default 'creating' check(status in ('creating','ready')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint product_price_by_tier check(
 (tier='standard' and expected_amount_kurus=75000) or
 (tier='ilyada3' and expected_amount_kurus=50000)
 ),
 constraint product_ready_fields check(status<>'ready' or (nullif(product_id,'') is not null and nullif(product_url,'') is not null))
);
alter table public.emlakcrm_shopier_product_config enable row level security;
revoke all on public.emlakcrm_shopier_product_config from PUBLIC,anon,authenticated;
grant select, insert, update on public.emlakcrm_shopier_product_config to service_role;
insert into public.emlakcrm_shopier_product_config(tier,expected_amount_kurus,product_id,product_url,status)
values ('standard',75000,'52694231','https://www.shopier.com/enginbaysal/52694231','ready')
on conflict(tier) do nothing;
comment on table public.emlakcrm_shopier_product_config is 'Shopier checkout products; 500 TRY product and URL are private until superadmin approves access.';