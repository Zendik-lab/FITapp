import type { LibraryRecipeData } from './library-types';
import { recipeCategories } from './model';
import { everydayRecipes } from './library-data-everyday';
import { mainRecipes } from './library-data-mains';
import { sweetRecipes } from './library-data-sweets';

// Keys keep recipe rows compact. Values are exact names in the shared food catalog.
const foods = {
  chicken: 'Куриная грудка сырая',
  cookedChicken: 'Куриная грудка варёная',
  thigh: 'Куриное бедро сырое без кожи',
  turkey: 'Индейка филе сырое',
  roastTurkey: 'Индейка запечённая',
  beef: 'Говядина постная сырая',
  pork: 'Свинина вырезка сырая',
  lamb: 'Баранина сырая',
  liver: 'Печень говяжья сырая',
  salmon: 'Лосось сырой',
  tuna: 'Тунец в собственном соку',
  cod: 'Треска сырая',
  pollock: 'Минтай сырой',
  mackerel: 'Скумбрия сырая',
  herring: 'Сельдь солёная',
  shrimp: 'Креветки варёные',
  sardines: 'Сардины в масле',
  egg: 'Яйцо куриное сырое',
  cookedEgg: 'Яйцо куриное варёное',
  milk: 'Молоко 2,5%',
  wholeMilk: 'Молоко 3,2%',
  cottage: 'Творог 5%',
  richCottage: 'Творог 9%',
  yogurt: 'Йогурт натуральный',
  greek: 'Йогурт греческий 2%',
  kefir: 'Кефир 2,5%',
  sour: 'Сметана 20%',
  cheese: 'Сыр твёрдый',
  mozzarella: 'Моцарелла',
  ryazhenka: 'Ряженка 4%',
  feta: 'Сыр фета',
  cream: 'Сливки 20%',
  rice: 'Рис сухой белый',
  cookedRice: 'Рис варёный белый',
  brownRice: 'Рис бурый сухой',
  buckwheat: 'Гречка сухая',
  oats: 'Овсяные хлопья сухие',
  millet: 'Пшено сухое',
  barley: 'Перловка сухая',
  cookedBarley: 'Перловка варёная',
  quinoa: 'Киноа сухая',
  bulgur: 'Булгур сухой',
  cookedBulgur: 'Булгур варёный',
  lentils: 'Чечевица варёная',
  dryLentils: 'Чечевица сухая',
  beans: 'Фасоль варёная',
  chickpeas: 'Нут варёный',
  cannedBeans: 'Фасоль красная консервированная',
  pasta: 'Макароны сухие',
  wholePasta: 'Макароны цельнозерновые сухие',
  noodles: 'Лапша яичная сухая',
  riceNoodles: 'Лапша рисовая сухая',
  whiteBread: 'Хлеб пшеничный',
  rye: 'Хлеб ржаной',
  wheatBread: 'Хлеб цельнозерновой',
  lavash: 'Лаваш тонкий',
  baguette: 'Багет',
  crispbread: 'Хлебцы ржаные',
  potato: 'Картофель сырой',
  cookedPotato: 'Картофель варёный',
  carrot: 'Морковь сырая',
  broccoli: 'Брокколи сырая',
  cucumber: 'Огурец',
  tomato: 'Помидор',
  cabbage: 'Капуста белокочанная',
  pepper: 'Перец сладкий',
  zucchini: 'Кабачок',
  onion: 'Лук репчатый',
  beet: 'Свёкла варёная',
  rawBeet: 'Свёкла сырая',
  peas: 'Горошек зелёный',
  corn: 'Кукуруза консервированная',
  spinach: 'Шпинат',
  mushroom: 'Шампиньоны',
  garlic: 'Чеснок',
  cauliflower: 'Капуста цветная',
  eggplant: 'Баклажан',
  cannedTomato: 'Консервированные томаты',
  paste: 'Томатная паста',
  radish: 'Редис',
  lettuce: 'Салат листовой',
  celery: 'Сельдерей стеблевой',
  pumpkin: 'Тыква',
  redCabbage: 'Капуста краснокочанная',
  sweetPotato: 'Батат',
  banana: 'Банан',
  apple: 'Яблоко',
  pear: 'Груша',
  orange: 'Апельсин',
  tangerine: 'Мандарин',
  grape: 'Виноград',
  kiwi: 'Киви',
  strawberry: 'Клубника',
  blueberry: 'Черника',
  mango: 'Манго',
  avocado: 'Авокадо',
  dates: 'Финики сушёные',
  raisins: 'Изюм',
  driedApricot: 'Курага',
  lemon: 'Лимон',
  lemonJuice: 'Лимонный сок',
  raspberry: 'Малина',
  frozenRaspberry: 'Малина замороженная',
  currant: 'Смородина чёрная',
  prunes: 'Чернослив',
  peach: 'Персик',
  plum: 'Слива',
  appleSauce: 'Яблочное пюре без сахара',
  peanut: 'Арахис',
  pb: 'Арахисовая паста без сахара',
  almond: 'Миндаль',
  walnut: 'Грецкий орех',
  cashew: 'Кешью',
  hazelnut: 'Фундук',
  sunflowerSeed: 'Семечки подсолнечника',
  chia: 'Семена чиа',
  flax: 'Семена льна',
  sesame: 'Кунжут',
  oliveOil: 'Масло оливковое',
  sunflowerOil: 'Масло подсолнечное',
  butter: 'Масло сливочное 82,5%',
  water: 'Вода питьевая',
  coffee: 'Кофе без сахара',
  appleJuice: 'Сок яблочный',
  oatDrink: 'Напиток овсяный',
  coconutMilk: 'Молоко кокосовое',
  chocolate: 'Шоколад тёмный 70%',
  honey: 'Мёд',
  sugar: 'Сахар',
  cocoa: 'Какао-порошок',
  whey: 'Протеин сывороточный (пример этикетки)',
  gainer: 'Гейнер (пример этикетки)',
  hummus: 'Хумус',
  tofu: 'Тофу',
  salt: 'Соль',
  blackPepper: 'Перец чёрный молотый',
  paprika: 'Паприка молотая',
  dill: 'Укроп',
  parsley: 'Петрушка',
  mint: 'Мята свежая',
  cinnamon: 'Корица молотая',
  mustard: 'Горчица готовая',
  soy: 'Соевый соус',
  vinegar: 'Уксус яблочный',
  olives: 'Оливки чёрные',
  ginger: 'Имбирь свежий',
  flour: 'Мука пшеничная',
  chickpeaFlour: 'Мука нутовая',
  cornFlour: 'Мука кукурузная',
  bakingPowder: 'Разрыхлитель',
  yeast: 'Дрожжи сухие',
} as const;

const collections = {
  mass: 'Для набора массы',
  energy: 'Высококалорийные',
  budget: 'Бюджетные',
  quick: 'Быстрые рецепты',
  simple: 'Простые блюда',
  batch: 'Для приготовления на несколько дней',
  few: 'До пяти ингредиентов',
} as const;

function lookup<T extends Record<string, string>>(labels: T, key: string) {
  if (!Object.prototype.hasOwnProperty.call(labels, key)) {
    throw new Error(`Неизвестный ключ справочника рецептов: ${key}`);
  }
  return labels[key as keyof T];
}

// One record per line: slug | name | prep cook servings difficulty [net] | collection keys |
// description | ingredient keys and grams | steps separated by ~ . A # line sets the category.
// 'net' is a nominal yield for cold mixtures that retain all weighed ingredients.
function readRecipes(source: string): LibraryRecipeData[] {
  let category: LibraryRecipeData['category'] | undefined;
  return source
    .trim()
    .split('\n')
    .flatMap((line) => {
      if (!line.trim()) return [];
      if (line.startsWith('# ')) {
        const label = line.slice(2).trim();
        category = recipeCategories.find((value) => value === label);
        if (!category)
          throw new Error(`Неизвестная категория рецептов: ${label}`);
        return [];
      }
      const [
        id,
        name,
        timing,
        collectionKeys,
        description,
        quantities,
        method,
      ] = line.trim().split('|');
      if (
        !category ||
        !id ||
        !name ||
        !timing ||
        !description ||
        !quantities ||
        !method
      ) {
        throw new Error(`Неполная запись рецепта: ${id}`);
      }
      const [prep, cook, servings, level, yieldRule] = timing.split(' ');
      const difficulty = lookup(
        { e: 'Простой', m: 'Средний', h: 'Сложный' } as const,
        level,
      );
      const ingredients = quantities.split(' ').map((entry) => {
        const [key, grams] = entry.split(':');
        return [lookup(foods, key), Number(grams)] as const;
      });
      return [
        {
          id,
          name,
          category,
          description,
          difficulty,
          ingredients,
          prep: Number(prep),
          cook: Number(cook),
          servings: Number(servings),
          tags: collectionKeys
            .split(' ')
            .filter(Boolean)
            .map((key) => lookup(collections, key)),
          steps: method.split('~'),
          ...(yieldRule === 'net'
            ? { weight: ingredients.reduce((sum, [, grams]) => sum + grams, 0) }
            : {}),
        },
      ];
    });
}

export const libraryData: readonly LibraryRecipeData[] = [
  ...readRecipes(everydayRecipes),
  ...readRecipes(mainRecipes),
  ...readRecipes(sweetRecipes),
];
