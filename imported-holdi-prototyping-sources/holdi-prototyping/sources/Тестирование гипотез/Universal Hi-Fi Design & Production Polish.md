# Universal Hi-Fi Design System & Layout Polish

## Роль этапа

Это этап после завершённого **Art Direction** и до отдельного **Visual Asset Production**.

На входе уже есть:

- полный прототип продукта;
- финальные тексты;
- Visual Intent / Role / Execution для значимых визуальных зон;
- выбранный арт-дирекшен;
- его central idea, композиционная логика, signature element и визуальная система;
- использованные на предыдущих этапах референсы и материалы продукта.

Не ищи новый арт-дирекшен и не начинай дизайн заново.

Твоя задача — **превратить выбранный арт-дирекшен в одну точную high-fidelity статическую систему страницы**: окончательно решить layout, typography, grid, spacing, surfaces, hierarchy, rhythm, signature language и геометрию visual zones.

Этот этап **не обязан производить финальные специализированные visual assets** — фотографии, human scenes, сложные иллюстрации, 3D/object scenes, финальные editorial scenes или другие production visuals. Они создаются на следующем этапе — **Universal Visual Asset Production Orchestrator**.

Hi-Fi должен быть настолько точным, чтобы следующий Asset Production stage понимал **что, где, какого масштаба и с какой ролью нужно создать**, а Assembly stage затем мог интегрировать approved assets без повторного редизайна страницы.

---

# Главная цель

Сделай выбранное направление **визуально зрелой, цельной и точно спроектированной статической системой всего лендинга**.

Доведи до высокого уровня:

- композицию;
- типографику;
- иерархию;
- grid;
- spacing;
- visual rhythm;
- цветовую систему;
- surfaces;
- borders / radii / shadows;
- signature element;
- архитектуру product UI;
- presentation states продукта;
- visual zones;
- asset placement constraints;
- transitions между секциями как статическую композицию;
- desktop master;
- responsive architecture.

На этом этапе уже должны ощущаться **характер, уверенность, визуальная дисциплина и дорогая дизайнерская система**.

Но не имитируй production quality отсутствующих ассетов дополнительными карточками, псевдоинтерфейсами, случайными градиентами или декоративными заменителями.

---

# 1. Сохрани выбранный арт-дирекшен

Выбранное направление является source of truth.

Сохрани:

- central visual idea;
- signature element;
- характер типографики;
- композиционную логику;
- цветовую систему;
- принципы подачи продукта;
- visual rhythm;
- заложенный характер бренда;
- motion character как intent, но не как production animation.

Можно развивать и уточнять решения, но нельзя незаметно заменить арт-дирекшен другим.

Весь лендинг должен ощущаться как **одна система**, а не набор отдельно стилизованных секций.

---

# 2. Работай со всем лендингом

Проработай **весь существующий прототип — от hero до финального CTA/footer**.

Не ограничивайся showcase-секциями.

Для каждой секции реши:

- её масштаб;
- composition type;
- text ↔ visual relationship;
- плотность;
- whitespace;
- visual focal point;
- роль signature element;
- surface / background treatment;
- место и геометрию будущих assets;
- связь с предыдущей и следующей секцией.

Создай ритм:

**кульминация → спокойствие → product proof → пространство → detail → новая кульминация.**

Не делай каждую секцию одинаково насыщенной.

---

# 3. Не меняй смысл прототипа

Не переписывай утверждённые тексты.

Не меняй без необходимости:

- порядок секций;
- UX;
- продуктовую логику;
- информационную архитектуру;
- CTA;
- основную идею каждого блока;
- Visual Intent / Role / Execution.

Допустимы локальные изменения расположения элементов внутри секции, если они нужны для сильной композиции.

Но Hi-Fi не должен превращаться в повторное проектирование продукта или структуры страницы.

---

# 4. Visual Intent / Role / Execution остаются source of truth

Visual Intent каждой значимой visual zone должен сохраниться.

Используй его как brief для композиции и будущего asset production.

Сохраняй рабочие annotations непосредственно в прототипе:

- **Visual Intent** — что должно быть показано;
- **Role** — какую мысль или доказательство несёт сцена;
- **Execution / Motion** — как она должна быть реализована и потенциально вести себя в движении.

Annotations являются design documentation, а не пользовательским контентом.

Они должны быть доступны команде, но визуально вторичны и при необходимости скрываемы в clean preview.

---

# 5. Не производи финальные specialized assets на этом этапе

Это ключевая граница этапа.

Не считай обязательным результатом Hi-Fi:

- финальную фотографию;
- финальную human scene;
- сложную иллюстрацию;
- финальный 3D / object render;
- production editorial scene;
- окончательный художественный hero asset;
- сложную визуальную метафору в финальном исполнении;
- набор готовых generated images.

Вместо этого для такой visual zone создай **точный production-ready placement context**:

- размеры и пропорции зоны;
- desktop placement;
- предполагаемый aspect behavior;
- focal point;
- required negative space;
- relationship с текстом;
- допустимый crop;
- background / layering context;
- visual intensity;
- annotation с Visual Intent / Role / Execution.

Если существующий арт-дирекшен уже содержит preliminary visual representation, можно сохранить её как **art-direction reference**, но не выдавай её автоматически за approved production asset.

---

# 6. Product UI: проектируй систему, не декоративную картинку

Product UI является исключением: его структурную систему нужно определить уже в Hi-Fi, потому что он влияет на layout и storytelling.

Определи:

- component language;
- typography;
- grid;
- spacing;
- controls;
- information hierarchy;
- states;
- iconography;
- data language;
- relationship с общей страницей.

Можно создавать структурные Product UI states в HTML/CSS/SVG, если они нужны для понимания композиции.

Но различай:

**Product UI architecture** — задача Hi-Fi;

**финальная production product scene / canonical dataset / presentation state polish** — задача Asset Production.

Не создавай новый вымышленный dashboard для каждой секции.

---

# 7. Visual Zones должны быть точными

Для каждой зоны будущего asset определи:

- asset type hypothesis;
- роль в narrative;
- relative importance;
- intended scale;
- desktop dimensions;
- preferred aspect ratio;
- safe area;
- focal area;
- text-safe area;
- допустимый overlap;
- background relationship;
- whether it should be full-bleed / contained / layered;
- mobile behavior hypothesis;
- whether asset must remain editable/vector/HTML;
- motion hook, если он очевиден.

Не заполняй visual zone псевдомокапом только потому, что пустой контейнер выглядит незавершённым.

Точная пустая зона с сильным Visual Intent лучше ложного «почти готового» asset.

---

# 8. Design System

Сформируй последовательную систему всего лендинга.

## Typography

Определи:

- display;
- H1 / H2 / H3;
- body;
- captions;
- labels;
- annotations;
- button typography;
- line-height;
- tracking;
- max line lengths;
- responsive behavior.

## Layout

Определи:

- desktop grid;
- content width;
- gutters;
- column behavior;
- section spacing;
- vertical rhythm;
- alignment rules;
- full-bleed behavior;
- overlap rules.

## Core UI

Определи:

- navigation;
- buttons;
- controls;
- forms;
- pricing;
- cards / containers, только если они действительно нужны;
- product surfaces.

## Visual Language

Определи:

- palette;
- accent usage;
- borders;
- radii;
- shadows;
- blur;
- gradients;
- depth;
- texture principles;
- imagery treatment direction;
- illustration treatment direction;
- iconography;
- signature element behavior.

Количество визуальных приёмов должно быть ограниченным.

Качество должно возникать из **точности, последовательности, отбора и restraint**, а не количества эффектов.

---

# 9. Signature Element

Signature element выбранного арт-дирекшена должен стать системным принципом.

Развивай его по странице:

- иногда как главный композиционный объект;
- иногда как spatial principle;
- иногда как background behavior;
- иногда как небольшая деталь;
- иногда как потенциальный motion hook.

Он должен повышать узнаваемость, но не превращаться в gimmick.

Не создавай отдельный новый signature asset на этом этапе, если его production требует специализированного визуального производства.

---

# 10. Craft и визуальное качество

Особенно внимательно проработай то, что действительно принадлежит Hi-Fi:

- размеры и интервалы;
- line-height;
- длину строк;
- optical alignment;
- масштаб заголовков;
- whitespace;
- баланс copy и visual zone;
- grid precision;
- surface hierarchy;
- borders / radii;
- shadow system;
- color relationships;
- masks / clipping logic;
- section transitions как статическую композицию;
- overall rhythm.

Не пытайся компенсировать отсутствие production asset декоративной детализацией контейнера вокруг него.

Избегай ощущения autogenerated SaaS template.

Premium quality чаще возникает из **точного решения того, что оставить, а не того, что ещё добавить**.

---

# 11. Работа с референсами

Используй только референсы, уже связанные с проектом и выбранным арт-дирекшеном.

Используй их как ориентиры по:

- composition;
- typography;
- proportions;
- rhythm;
- visual discipline;
- presentation of product;
- relationship между контентом и будущими assets.

Не копируй конкретный сайт.

Выбранный арт-дирекшен важнее любого отдельного референса.

---

# 12. Desktop first, responsive by design

Основная art-direction и Hi-Fi проработка — desktop.

Desktop должен быть полностью решён как **статический design master**.

При этом архитектура должна быть изначально responsive:

- гибкие grids;
- fluid sizing;
- корректное поведение visual zones;
- отсутствие критической зависимости от фиксированной ширины;
- разумная адаптация typography;
- stacking rules;
- order rules;
- базовые crop assumptions.

Mobile на этом этапе должен **структурно работать**, но глубокая mobile art-direction и финальный small-screen polish относятся к более позднему отдельному этапу.

Не превращай Hi-Fi в финальный mobile production pass.

---

# 13. Motion readiness, но не Motion Production

Не создавай полноценный motion design.

Зафиксируй в annotations только потенциальные:

- reveal;
- transformation;
- scroll sequence;
- product transition;
- state change;
- parallax;
- microinteraction;
- causal animation.

Статическая композиция должна быть убедительной без анимации.

Следующие этапы определят реальный motion после интеграции production assets.

---

# 14. Технический результат

Создай **одну полную работающую high-fidelity статическую версию всего лендинга**.

Основной результат:

- HTML;
- CSS;
- только необходимый JavaScript для базовой работы / preview;
- complete desktop layout;
- responsive architecture;
- finalized typography / grid / spacing / surfaces;
- structural Product UI states там, где они нужны;
- точные production visual zones;
- сохранённые Visual Intent / Role / Execution;
- Asset Production Handoff.

**Финальные специализированные visual assets не являются обязательным deliverable этого этапа.**

Если они уже существуют как утверждённые материалы продукта, их можно использовать как входные данные. Но не создавай их с нуля вместо следующего Asset Production stage.

---

# 15. Asset Production Handoff

Для каждой значимой visual zone подготовь handoff следующему этапу:

- section ID;
- Visual Intent;
- Role;
- Execution / Motion intent;
- visual zone dimensions / proportions;
- expected asset type;
- importance: anchor / supporting;
- placement context;
- focal point;
- negative-space constraints;
- crop constraints;
- desktop behavior;
- mobile behavior hypothesis;
- editable/vector/HTML requirements;
- relevant product state / data requirements;
- relevant references from the approved art direction.

Это не Asset Map финального production stage, а **точный вход для Asset Planner**, который затем сам определит окончательную asset system.

---

# 16. Финальное ревью Hi-Fi

После первой реализации проведи критический review всей страницы.

Оцени от 1 до 10:

1. Art-direction fidelity
2. Visual hierarchy
3. Composition
4. Typography
5. Grid precision
6. Whitespace / restraint
7. Page rhythm
8. Signature-element consistency
9. Product-storytelling architecture
10. Quality of visual zones
11. Product UI architecture
12. Brand distinctiveness
13. Readiness for Asset Production
14. Responsive architecture

Дополнительно ответь:

> **Если завтра специализированная visual-production команда получит этот Hi-Fi, сможет ли она создать assets без необходимости сначала передизайнивать страницу?**

Если ответ «нет» — Hi-Fi ещё не закончен.

Если общая оценка ниже **9/10**, исправь несколько наиболее фундаментальных проблем и проведи review снова.

Максимум — 3 major refinement iterations.

---

# Definition of Done

Этап считается завершённым, когда:

- проработан весь лендинг;
- сохранена исходная концепция арт-дирекшена;
- сформирована последовательная design system;
- desktop static master полностью решён;
- typography / grid / spacing / surfaces / hierarchy доведены до высокого уровня;
- все значимые visual zones имеют точный placement context и annotations;
- Product UI architecture определена там, где она нужна;
- отсутствуют случайные псевдофинальные placeholder-решения;
- responsive architecture структурно работает;
- существует понятный Asset Production Handoff;
- качество Hi-Fi достигло **≥9/10**;
- дальнейший качественный скачок требует **специализированного Visual Asset Production**, а не ещё одной перестройки layout.

После этого остановись.

Следующий этап:

# Universal Visual Asset Production Orchestrator

---

# Ключевая установка

**Hi-Fi определяет страницу. Asset Production создаёт содержимое её visual zones. Не смешивай эти две ответственности.**

Страница уже должна обладать сильной системой и арт-дирекшеном, но не обязана притворяться, что отсутствующие production assets уже существуют.
