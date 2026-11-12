-- Extensions, the private schema and enum types.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Helper and trigger functions live here. The schema is not exposed through the Data API,
-- and anon/authenticated get no usage on it.
create schema if not exists private;
revoke all on schema private from public;

create type public.user_role         as enum ('owner', 'agent', 'admin');
create type public.listing_type      as enum ('sale', 'rent');
create type public.listing_status    as enum ('draft', 'published', 'sold_or_rented', 'archived');
create type public.currency_code     as enum ('MNT', 'USD');
create type public.building_material as enum ('panel', 'brick', 'monolithic', 'other');
create type public.heating_type      as enum ('central', 'autonomous', 'electric', 'other');
create type public.parking_type      as enum ('none', 'outdoor', 'garage', 'underground');
create type public.furnishing        as enum ('none', 'partial', 'full');
create type public.scan_status       as enum ('uploaded', 'ready', 'failed');
create type public.report_reason     as enum ('fake', 'wrong_info', 'unavailable', 'duplicate', 'offensive', 'other');
create type public.report_status     as enum ('open', 'resolved', 'dismissed');
