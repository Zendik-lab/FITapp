# Этап 05.2. Расширение каталогов FITapp

Рабочая сборка от 27.11.2026 подготовлена в `dist`. Продуктовый каталог превысил ориентир 100 000 реальных товаров. Для закрытия этапа остаются ориентир по рецептам и приёмка на физических устройствах.

## Продукты и рецепты

| Показатель                                                    | До расширения | После расширения |
| ------------------------------------------------------------- | ------------: | ---------------: |
| Встроенные продукты и ингредиенты                             |         2 003 |            2 419 |
| Позиции во всех скачиваемых продуктовых пакетах               |             0 |          348 850 |
| Продукты и ингредиенты при установке всех пакетов             |         2 003 |          351 269 |
| Уникальные товарные штрихкоды во встроенной базе и пакетах    |             0 |          349 250 |
| Различные нормализованные значения поля бренда в новых данных |             0 |           56 594 |
| Товары с Казахстаном в списке стран продажи                   |             0 |              462 |
| Рецепты с рассчитанными КБЖУ                                  |           187 |              196 |
| Дополнительные карточки приготовления с неполными КБЖУ        |             0 |              459 |
| Всего карточек рецептов                                       |           187 |              655 |

В базу вошли 400 товаров Open Food Facts и 16 справочных ингредиентов USDA SR Legacy для рецептов. Казахстан указан у 180 встроенных товаров и ещё у 282 в отдельном пакете. Пакеты Казахстана и СНГ вместе с региональной встроенной выборкой дают 19 210 позиций. Страны берутся из метаданных продаж. Упаковки разных размеров и вариантов сохраняют собственные GTIN. Одно поле бренда может содержать несколько названий поставщика. В региональной выборке найдены по полю бренда 17 FoodMaster, 7 «Рахат», 1 «Баян Сулу», 8 «Султан», 1 «Цесна», 6 «Шин-Лайн», 22 Snickers и 59 «Простоквашино». Для «Адал» совпадений в этом срезе нет.

Штрихкоды проверены по контрольной цифре. Пакеты содержат только записи с полным набором основных КБЖУ. Дополнительные нутриенты отображаются при наличии данных. Сохранённые онлайн-результаты и пользовательские записи в объём выпуска не входят.

## Источники и лицензии

- Open Food Facts. Официальная выгрузка TSV размером 1 543 434 827 байт. Проверено 4 929 745 строк, после контроля качества осталось 3 154 872 уникальных подходящих записей. Распространяемая выборка содержит 249 250 товаров. База распространяется по ODbL 1.0, содержимое записей по Database Contents License. Ссылки на отдельные товары и лицензии сохранены. [Данные и API Open Food Facts](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) · [Лицензии](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)
- USDA FoodData Central. Использованы Branded CSV от 29.10.2026 и SR Legacy от апреля 2018 года. Из 2 010 212 строк Branded подготовлены 100 000 товаров с полным набором КБЖУ, отдельно от пакетов Open Food Facts. При отборе пропущены штрихкоды, уже включённые в выборку Open Food Facts. Лицензия CC0 1.0. [Выгрузки USDA](https://fdc.nal.usda.gov/download-datasets/) · [Политика лицензирования](https://fdc.nal.usda.gov/)
- Рецепты. Сохранены 150 базовых рецептов. Полная библиотека включает 35 UniTools, 10 переводов польского Wikibooks и один салат по-казахски из русского Викиучебника. Пакет из 459 карточек UniTools сохраняет исходные меры и показывает, каких данных не хватает для расчёта. Семь исходных карточек UniTools отклонены. Адаптации распространяются по CC BY-SA 4.0. [UniTools](https://github.com/farcrak/unitools-recipes) · [Open Recipe Corpus](https://github.com/Rippy1911/open-recipe-corpus) · [Источник казахского салата](https://ru.wikibooks.org/w/index.php?oldid=262924) · [Лицензия Wikibooks](https://en.wikibooks.org/wiki/Wikibooks%3ACopyrights)

## Размеры пакетов

| Пакет                           | Позиции | Байты загрузки | Части |
| ------------------------------- | ------: | -------------: | ----: |
| Казахстан                       |     282 |         21 013 |     1 |
| СНГ и соседние страны           |  18 568 |      2 207 847 |    38 |
| Спортивное питание              |  10 000 |      2 090 412 |    20 |
| Готовая еда                     |  20 000 |      4 759 239 |    40 |
| Международные продукты          | 100 000 |     16 860 142 |   200 |
| Международные продукты, часть 2 | 100 000 |     16 606 901 |   200 |
| USDA Branded                    | 100 000 |     12 934 048 |   200 |
| Дополнительные рецепты          |     459 |        210 245 |     1 |

Готовый выпуск включает 59 544 614 байт актуальных файлов. Предварительный кеш оболочки занимает 3 830 012 байт, из которых 3 613 772 байт составляют JavaScript. Нативный экспорт Hermes занимает 4 303 089 байт.

Продуктовые части занимают 55 479 602 байта, крупнейшая часть — 135 639 байт. Манифест занимает 155 407 байт. Новая встроенная выборка товаров занимает 316 687 байт до упаковки Metro. Service Worker предварительно кеширует оболочку и манифест. Части скачиваются по выбору пользователя. [Лимиты Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)

## Приложение

- «Питание → Поиск продуктов → Офлайн-каталоги» показывает размер скачивания и прогресс. Части проверяются по SHA-256. Повторная загрузка продолжает зафиксированный импорт. При обновлении предыдущая версия доступна до завершения установки следующей. Удаление пакета сохраняет дневник, избранное и собственные продукты.
- Пакеты продуктов используют отдельную IndexedDB в PWA и SQLite в Expo. Запросы читают ограниченные страницы из индексированных диапазонов. Поиск использует названия, бренды, категории, варианты написания, транслитерацию и проверку близких совпадений. Фильтры учитывают КБЖУ, страну и доступность офлайн. [Политика хранения Safari и установленных PWA](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Сканер проверяет локальный справочник, установленные пакеты и сохранённые товары перед точечным запросом Open Food Facts. EAN-8 и UPC-E различаются по формату сканера или по выбору при ручном вводе. В браузере декодирует ZXing через камеру, в Expo используется `expo-camera`. Порции в граммах и миллилитрах хранятся раздельно. [Форматы GS1](https://support.gs1.org/support/solutions/articles/43000734104-which-barcodes-are-used-to-represent-gtins-)
- «Питание → Рецепты» позволяет установить и удалить расширенную библиотеку. Полные рецепты по-прежнему масштабируют ингредиенты и добавляются в дневник. У карточек с неизвестными ингредиентами отображается причина неполного расчёта. Запись такого блюда в дневник через расчёт пакета недоступна.

## Повторение импорта на Windows

Готовые продуктовые части можно использовать повторно перед любой веб-сборкой. Команды ниже скачивают исходники в новый локальный каталог для обновления. Дистрибутив содержит только выбранные части и манифест.

```powershell
Set-Location D:\FitApp
$catalogCache = '.expo/catalog-05.2-next'
python -B scripts/import-global-catalog.py --cache $catalogCache prepare off --download
python -B scripts/import-global-catalog.py --cache $catalogCache prepare usda --download
python -B scripts/import-global-catalog.py --cache $catalogCache pack
python -B scripts/import-global-catalog.py --cache $catalogCache audit
$env:FITAPP_CATALOG_DIR = Join-Path $catalogCache 'published'
npm run build:web
npm run verify:web
Remove-Item Env:FITAPP_CATALOG_DIR
```

При наличии готовых файлов `off.tsv.gz` и `usda-branded.zip` в целевом кеше `prepare` читает их локально. При наличии готовых `*-staging.sqlite` достаточно команды `pack`. Отчёт об импорте пишется в `product-report.json`. Рецепты и связанный справочник воспроизводятся командой `python -B -X utf8 scripts/import-catalog.py .expo/catalog-05.2`. Тот же скрипт сохраняет список отклонений и причины.

## Измерения

| Проверка                            | Результат и среда                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Нормализация официальных выгрузок   | Open Food Facts 407,02 с, USDA Branded 58,42 с на Windows                                                                       |
| Формирование 699 продуктовых частей | 35,24 с в последнем формировании из готовых промежуточных таблиц                                                                |
| SQLite, 100 000 реальных товаров    | 72,218 с импорта, 374 505 472 байта файл БД, пиковая куча Node 115 МБ                                                           |
| SQLite, 100 реальных GTIN           | 100/100 найдено, медиана 0,10 мс, p95 0,16 мс                                                                                   |
| SQLite, поисковые запросы           | Медианы в пределах 0,45–0,60 мс для `rice`, `Snickers`, `молок`, `milk`. Широкий префикс `s` — 7,52 мс                          |
| WebKit, 500 реальных товаров        | 7,998 с импорта, 30 мс открытие и чтение метаданных. 100/100 реальных GTIN найдены, p95 16,53 мс с учётом Playwright round trip |

Измерения SQLite проведены с файловой базой Node, измерения WebKit — в настольном Playwright. Физический телефон даст собственные значения задержки, объёма хранения и времени импорта.

В Chromium 159 индекс IndexedDB принял 100 000 реальных записей за 65,47 с. `navigator.storage.estimate()` показал 679 141 376 байт IndexedDB. Найдены все 100 контрольных GTIN, медиана 0,91 мс и p95 1,65 мс с запросом из Playwright. Индексированные страницы из 20 результатов дали медиану 1,90–2,20 мс для четырёх предметных запросов и 5,22 мс для широкого префикса. Браузерный процесс сообщал 533 440 499 байт JS-кучи в конце измерения, включая создание и передачу строк из тестового стенда. Это измерение отличается от памяти экрана поиска у пользователя.

Три запуска production-экспорта `0e7e736c7257f273171c` из чистого контекста браузера до появления интерактивной кнопки «Начать» дали медиану 975 мс в Chromium и 981 мс в WebKit. Замер проводился с локальным HTTP-сервером на Windows.

## Проверки

ESLint, строгая проверка TypeScript и Prettier прошли. Jest выполнил 212 проверок в 35 наборах. Шесть тестов импортёров Python прошли. Аудит подтвердил 349 250 товарных GTIN и 699 сжатых частей после исключения семи неверных значений размера порций и упаковок.

Экспорт `npm run build:web` и `npm run verify:web` подтвердили production-сборку `34a688b74b9600c71f6d`, 39 ресурсов оболочки и 699 продуктовых частей. Экспорт Expo iOS сформировал Hermes-байткод. Metro использовал резервное разрешение внутреннего импорта `@noble/hashes` и завершил обе сборки.

Публичный API Open Food Facts по коду Nutella вернул HTTP 200, включая CORS. Старый поиск по названию вернул 503. FITapp переведён на Search-a-licious, который вернул реальные результаты Snickers по HTTP 200. [Search-a-licious](https://openfoodfacts.github.io/search-a-licious/users/ref-openapi/)

Полный браузерный прогон сборки `0e7e736c7257f273171c` выполнил 156 сценариев. Прошёл 151, четыре выявили сбои, один сценарий с подстановкой физических отступов через Chromium CDP штатно пропущен в WebKit. В трассировках сохранённого GTIN-14 оба движка зафиксировали недоступное без Service Worker подключение модуля пакетов. Модуль теперь входит в основной код поиска. При отказе самого хранилища найденный сохранённый продукт остаётся доступен. Сценарии Safe Area и отказа камеры уточнили выбор целевого элемента и сохраняют исходные проверки.

На финальной сборке `34a688b74b9600c71f6d` повторно прошли все четыре упавших сценария. Целевая проверка дала 11 пройденных сценариев и один штатный пропуск WebKit. Она охватила скачивание и удаление обоих каталогов, холодный старт PWA, GTIN-14, офлайн-добавление объёмной порции, онлайн-поиск и Safe Area. Полный прогон и целевая перепроверка зафиксированы в `.expo/catalog-05.2/playwright-final.log` и `.expo/catalog-05.2/playwright-verified.log`.

## Изменённые области проекта

- Импорт, данные и сборка — `scripts/import-global-catalog.py`, `scripts/global_catalog_sources.py`, `scripts/import-catalog.py`, `scripts/catalog_import_support.py`, `scripts/catalog-ingredient-map.tsv`, `scripts/catalog-wikibooks-*.jsonl`, `scripts/catalog-assets.cjs`, `scripts/build-web.cjs`, `scripts/verify-web.cjs`, `scripts/pwa-export.cjs`, `public/catalog`, `public/catalog-licenses.txt`, `public/_headers`.
- Каталоги, поиск, порции и сканер — `src/features/catalog`, `src/features/food`, `src/database/repositories/food.ts`. Объёмные порции также учтены в `src/features/demo/today-screen.tsx` и инструментах питания в `src/features/smart`.
- Рецепты, фильтры и подгрузка — `src/features/recipes`. Проверки расположены в `tests/catalog-*.test.ts`, `tests/barcode-lookup.test.ts`, `tests/food-*.test.ts`, `tests/ingredient-catalog.test.ts`, `tests/recipe-library.test.ts`, `tests/stage-05.2.test.ts`, `tests/e2e/food-diary.spec.ts` и `scripts/test_global_catalog.py`.

<details>
<summary>Полный список файлов</summary>

- `ROADMAP.md`
- `STAGE_05_2_PROGRESS.md`
- `STAGE_05_2_REPORT.md`
- `docs/STAGE-05.2.md`
- `package-lock.json`
- `package.json`
- `public/_headers`
- `public/catalog-licenses.txt`
- `public/catalog/recipe-expansion/881420fbe6b39d2eb96840e1d62bbd50352af634f3f7194aab27bc45d1666d81.json.gz`
- `scripts/build-web.cjs`
- `scripts/catalog-assets.cjs`
- `scripts/catalog-ingredient-map.tsv`
- `scripts/catalog-wikibooks-regional.jsonl`
- `scripts/catalog-wikibooks-ru.jsonl`
- `scripts/catalog_import_support.py`
- `scripts/global_catalog_sources.py`
- `scripts/import-catalog.py`
- `scripts/import-global-catalog.py`
- `scripts/pwa-export.cjs`
- `scripts/test_global_catalog.py`
- `scripts/verify-web.cjs`
- `src/database/repositories/food.ts`
- `src/features/catalog/catalog-chunk.ts`
- `src/features/catalog/catalog-format.ts`
- `src/features/catalog/catalog-packs-screen.tsx`
- `src/features/catalog/catalog-product-results.tsx`
- `src/features/catalog/catalog-service.ts`
- `src/features/catalog/catalog-storage-contract.ts`
- `src/features/catalog/catalog-storage.ts`
- `src/features/catalog/catalog-storage.web.ts`
- `src/features/catalog/product-catalog-filters.tsx`
- `src/features/demo/today-screen.tsx`
- `src/features/food/barcode-lookup.ts`
- `src/features/food/camera-scanner.tsx`
- `src/features/food/camera-scanner.web.tsx`
- `src/features/food/catalog-core-data.ts`
- `src/features/food/catalog-usda-expansion.ts`
- `src/features/food/catalog.ts`
- `src/features/food/diary-screen.tsx`
- `src/features/food/domain.ts`
- `src/features/food/food-flow.tsx`
- `src/features/food/food-search.tsx`
- `src/features/food/model.ts`
- `src/features/food/off-api.ts`
- `src/features/food/operations.ts`
- `src/features/food/product-detail.tsx`
- `src/features/food/product-editor.tsx`
- `src/features/food/product-picker.tsx`
- `src/features/food/scanner-screen.tsx`
- `src/features/recipes/domain.ts`
- `src/features/recipes/library-expansion-manifest.ts`
- `src/features/recipes/library-types.ts`
- `src/features/recipes/library-unitools.ts`
- `src/features/recipes/library-wikibooks.ts`
- `src/features/recipes/library.ts`
- `src/features/recipes/model.ts`
- `src/features/recipes/operations.ts`
- `src/features/recipes/recipe-controls.tsx`
- `src/features/recipes/recipe-detail.tsx`
- `src/features/recipes/recipe-editor.tsx`
- `src/features/recipes/recipe-flow.tsx`
- `src/features/recipes/recipe-library-controls.tsx`
- `src/features/recipes/recipe-pack.ts`
- `src/features/recipes/recipe-search.ts`
- `src/features/smart/compare-budget-screen.tsx`
- `src/features/smart/pantry-screen.tsx`
- `src/features/smart/planning.ts`
- `src/features/smart/recommend.ts`
- `src/features/smart/smart-meal-screen.tsx`
- `tests/barcode-lookup.test.ts`
- `tests/catalog-format.test.ts`
- `tests/catalog-storage.test.ts`
- `tests/e2e/food-diary.spec.ts`
- `tests/e2e/ui-audit.spec.ts`
- `tests/food-api.test.ts`
- `tests/food-domain.test.ts`
- `tests/food-storage.test.ts`
- `tests/ingredient-catalog.test.ts`
- `tests/recipe-library.test.ts`
- `tests/stage-05.2.test.ts`

</details>

## Открытые критерии

- Ориентир 10 000 качественных рецептов пока не достигнут. Из 1 561 англоязычной карточки перевода Open Recipe Corpus при строгом сопоставлении названий, количеств и мер обнаружено 20 кандидатов на полный расчёт, включая уже импортированные рецепты. Проверенная историческая коллекция Open Recipe Archive содержит исходные тексты, но выборка не даёт достоверных порций и неоднозначные меры требуют отдельной проверки. Другие крупные наборы включают перепечатки коммерческих сайтов без подтверждённого разрешения правообладателей. Эти записи не использованы. [Open Recipe Corpus](https://github.com/Rippy1911/open-recipe-corpus) · [Пример Open Recipe Archive](https://github.com/AdamBouhmad/open-recipe-archive) · [Происхождение Open Global Recipes](https://github.com/drwjkirkpatrick-web/open-global-recipes/blob/main/docs/DATA_SOURCES.md)
- В компактной выгрузке Open Food Facts отдельное поле базы 100 г или 100 мл отсутствует. Импорт нормализует единицы по доступным метаданным порции и упаковки, пропускает противоречия. Точечный API использует явную базу для объёмных записей.
- Приёмка с реальной камерой остаётся открытой на физическом iPhone в Safari, установленной PWA и Expo, а также на Android Chrome. На iPhone дополнительно нужны установка и удаление большого пакета, прерывание и возобновление на слабой сети, повторный запуск в авиарежиме, обновление существующей PWA и сохранение записей дневника.
