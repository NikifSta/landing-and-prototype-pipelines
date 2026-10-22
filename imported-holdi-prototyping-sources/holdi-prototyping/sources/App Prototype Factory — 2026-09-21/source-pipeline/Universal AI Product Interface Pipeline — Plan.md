# Universal AI Product Interface Pipeline

Зафиксированный план проекта по созданию мощного AI-пайплайна проектирования интерфейсов — от описания продукта до готового работающего production frontend.

## Главный вывод исследования

Генерация интерфейса не должна быть подэтапом генерации лендинга.

Это должен быть отдельный полноценный pipeline создания продукта. Лендинг потом получает из него уже готовые, правдоподобные, работающие интерфейсы.

Именно здесь, скорее всего, была фундаментальная проблема с Holdi.

---

# 1. Что сейчас происходит с UI/UX в 2026

Самая важная тенденция — не Liquid Glass, не bento и даже не AI.

Главная тенденция:

**design → prototype → code перестают быть отдельными стадиями.**

Figma в 2026 двигает workflow к модели `canvas ↔ code`: реальные компоненты, production code и design context ходят туда-обратно, а не передаются один раз разработчику после завершения макета.

В их исследовании 8 403 участников дизайнеры всё чаще участвуют в разработке, разработчики — в дизайне, а главным преимуществом становится уже не скорость генерации, а качество решений и совместный контекст.

NN/g приходит практически к тому же выводу с другой стороны: AI отлично ускоряет производство вариантов, но без UX-контекста воспроизводит усреднённые интерфейсные паттерны. Поэтому новая работа дизайнера — всё больше описывать намерение, контекст и критерии хорошего решения, а затем критиковать и отбирать генерации.

То есть:

### Старый мир

`PRD → wireframe → Figma → handoff → frontend`

### 2026

`product context → explore → working prototype → critique → design system → code ↔ canvas → test → refine → ship`

---

# 2. Какие тренды 2026 действительно стоит встроить в pipeline

Не обязательно визуально применять их все. Они должны влиять на **способ проектирования**.

По опросу Lyssna среди дизайнеров самыми значимыми направлениями 2026 называют AI как design-collaborator, агентные интерфейсы, AI-assisted accessibility, прозрачность AI, real-time personalization и multimodal interfaces. При этом 54% опрошенных говорят, что клиенты хотят AI-функции без ясного use case — хороший сигнал не добавлять модные вещи ради моды.

В pipeline стоит выделить восемь реально полезных направлений:

1. **Adaptive / agentic UI.** Интерфейс может зависеть от контекста и текущей задачи, а не быть неизменным набором экранов.
2. **Calm interface.** Меньше декоративного шума, лучше hierarchy и cognitive clarity.
3. **Purposeful motion.** Motion объясняет изменение состояния, причинность и hierarchy, а не просто «оживляет UI».
4. **Multimodality.** Keyboard, mouse, touch, voice, AI commands могут сосуществовать.
5. **Context-aware generation.** Агенту передаётся не огромный промпт, а структурированный продуктовый и дизайнерский context.
6. **Real components rather than generated rectangles.** AI должен оперировать design system.
7. **Working prototypes раньше.** Не ждать production frontend, чтобы понять, работает ли interaction.
8. **Human imperfection / identity.** Визуальная стерильность AI стала настолько распространённой, что собственный character и craft становятся конкурентным преимуществом.

---

# 3. Что важно забрать у Apple

У Apple в 2026 сформулированы восемь фундаментальных design principles:

**Purpose → Agency → Responsibility → Familiarity → Flexibility → Simplicity → Craft → Delight.**

Это хорошая основа для reviewer'а.

Причём «Apple level» не значит «сделать всё стеклянным».

Liquid Glass должен в основном существовать как функциональный слой navigation/controls поверх контента. Content layer не должен превращаться в стекло, иначе теряется hierarchy.

То есть Apple quality для pipeline — это прежде всего:

**ясность задачи → hierarchy → знакомые паттерны → свобода пользователя → адаптивность → точность → продуманное движение → характер.**

Эффекты — только потом.

---

# 4. WWDC26 как blueprint нужного pipeline

Apple Design Team показывает работу с coding agents примерно следующим образом:

**generate many → compare → remix → repeat → populate with realistic content → cover edge cases → tune interaction → preview → test.**

Агент сразу делает много разных вариантов интерфейса; человек выбирает удачные идеи из разных вариантов и заставляет агента remix'ить их.

Затем интерфейс специально наполняется правдоподобными данными и проверяется на:

- empty states;
- длинные тексты;
- большие списки;
- альтернативные состояния;
- реальные изображения;
- ошибки;
- различные configuration states.

И только потом отдельно настраиваются animation curves, springs, timing, phases и ключевые interaction moments.

В другом WWDC26-сеансе Apple показывает orchestration нескольких задач с sub-agents, а затем Build → Preview → Test → Accessibility.

Это почти готовый blueprint для нашего pipeline.

Важно: агентам нельзя отдавать критическое дизайнерское мышление полностью. Человек/критик должен сохранять контроль над UX-решениями и критериями качества.

---

# 5. Почему интерфейс Holdi получился слабым

Проблема была в постановке задачи.

Мы фактически давали системе что-то вроде:

> «Вот секция лендинга, покажи здесь интерфейс продукта».

И агент начинал рисовать **изображение интерфейса**.

А хороший UI появляется из совершенно другой постановки:

> «Вот пользователь. Вот его задача. Вот данные. Вот состояние системы. Вот предыдущий шаг. Вот что он хочет сделать дальше. Вот ограничения. Спроектируй лучший способ выполнить эту задачу».

Разница колоссальная.

У нас отсутствовал промежуточный слой:

**Product → UX model → State model → Interaction model → UI**

и мы прыгнули:

**Product → pretty UI.**

Именно поэтому AI обычно выдаёт красивый, но фальшивый SaaS:

sidebar + cards + avatars + gradient button + lorem ipsum.

Без подробного контекста AI следует общему направлению, но генерирует стандартные, неотличимые решения и плохо принимает сложные дизайнерские trade-offs.

---

# 6. Архитектура нового pipeline

Рабочее название:

## Universal AI Product Interface Pipeline

Pipeline делится не на два-три гигантских промпта, а на **три цикла**:

**DISCOVER → DESIGN → BUILD**

При этом каждый цикл содержит divergent phase и convergence/review phase.

Полная цепочка:

**Product Description  
↓  
Product Context  
↓  
User & Task Model  
↓  
Information Architecture  
↓  
Flows & State Model  
↓  
Synthetic Data Preparation  
↓  
UX Concepts × 5–10  
↓  
UX Review  
↓  
Visual Directions  
↓  
Design System  
↓  
Hi‑Fi Interface  
↓  
Lived-in & Edge-case Stress Pass  
↓  
Interaction & Motion Pass  
↓  
Working Code Prototype  
↓  
User / Heuristic Review  
↓  
Production Frontend  
↓  
Visual + Functional + Accessibility QA  
↓  
Approved UI Package**

---

# 7. Подробный план этапов

| Этап | Что происходит | Главный результат |
|---|---|---|
| **00. Product Intake** | Из описания продукта извлекаются цель, аудитория, задачи, platform, ограничения и business logic | `PRODUCT_CONTEXT.md` |
| **01. UX Context** | Определяем пользователей, Jobs-to-be-Done, сценарии, частоту, environment, важность операций | `UX_CONTEXT.md` |
| **02. Domain Model** | Сущности продукта и их отношения: meeting, user, transcript, topic, notification и т. п. | `DOMAIN_MODEL` |
| **03. Information Architecture** | Где что находится и почему. Navigation hierarchy | IA-map |
| **04. User Flows** | End-to-end сценарии выполнения основных задач | flow diagrams |
| **05. State Architecture** | Loading/error/empty/processing/success/permissions/edge cases для каждого экрана | `STATE_MATRIX.json` |
| **06. Synthetic Data Preparation** | До прототипирования создаётся единый согласованный набор синтетических данных, который реализует сущности, связи, основные сценарии и состояния продукта | `SYNTHETIC_DATASET.json` |
| **07. UX Concept Exploration** | 5–10 принципиально разных способов решить ключевой UX; каждый прототип с первого экрана использует единый синтетический набор данных | working populated low/mid-fi concepts |
| **08. UX Convergence** | Reviewer критикует варианты, собирает лучшие решения, убирает слабые | approved populated UX architecture |
| **09. Visual Art Direction** | 3–5 разных визуальных систем поверх одного UX | visual directions |
| **10. Design System** | Typography, color, spacing, elevation, radii, controls, components, states | tokens + component library |
| **11. Hi‑Fi Interface** | Проектируется не три красивые картинки, а весь продуктовый flow | complete UI |
| **12. Lived‑in & Edge-case Pass** | Синтетические данные расширяются длинными, пустыми, плотными, ошибочными и редкими комбинациями; интерфейс проверяется и исправляется | stress-tested realistic interface |
| **13. Interaction & Motion** | Hover, pressed, transitions, loading, feedback, motion choreography | interactive prototype |
| **14. Code Prototype** | Интерфейс превращается в настоящий frontend, а не кликабельную картинку | running app |
| **15. UX Validation** | Heuristic review + сценарное тестирование + при возможности пользователи | issue list |
| **16. Production Polish** | Правки после тестов; pixel/detail/motion/copy refinement | final design |
| **17. Production Frontend** | Реальные компоненты, responsive, semantic HTML, state logic | production code |
| **18. Automated QA** | Visual regression, interaction, accessibility, performance | passing CI |
| **19. UI Asset Packaging** | Из живого продукта делаются состояния для лендингов, рекламы, docs | `UI_ASSET_PACKAGE` |

Это 20 этапов с нумерацией 00–19, а не 3. AI позволяет проходить их быстро, но пропускать их нельзя.

Design process не исчезает — он сжимается.

---

# 8. Архитектура агентов

Не нужен один «super designer agent».

Это почти наверняка приведёт обратно к посредственности.

У оркестратора должно быть минимум **13 специализированных ролей**:

| Агент | Зона ответственности |
|---|---|
| Product Analyst | понимает продукт |
| UX Researcher | пользователи, задачи, evidence |
| Information Architect | структура |
| Interaction Designer | flows и behavior |
| State Architect | состояния и edge cases |
| Synthetic Data Designer | единая правдоподобная модель примеров, связей и fixtures |
| UX Writer | interface copy |
| Visual Art Director | визуальная идея |
| Design System Architect | tokens/components |
| Motion Designer | динамика |
| Accessibility Reviewer | accessibility |
| Frontend Architect | architecture/components |
| UI QA Critic | финальная критика |

Сверху работает:

**Orchestrator**.

Он не рисует UI сам.

Он управляет specialist agents, собирает результаты и решает, какой следующий этап запускать.

---

# 9. Отдельный независимый Critic

Это одна из ключевых вещей.

В эпоху AI critique становится центральной дизайнерской компетенцией: вместо того чтобы вручную специфицировать каждый пиксель, нужно формализовать, что означает «хорошо», и затем проверять генерации против этих критериев.

Схема должна быть:

**Generator → Critic → Generator → Critic**

а не:

**Generator → готово.**

Reviewer вообще не должен генерировать вариант сам до того, как оценит существующий.

Иначе он будет защищать собственное решение.

---

# 10. Apple Quality Gate

После ключевых стадий Critic выставляет оценку.

Не «красиво / некрасиво».

А:

| Критерий | Вес |
|---|---:|
| Purpose / решает ли задачу | 15 |
| Task efficiency | 10 |
| Information hierarchy | 10 |
| Agency / control / undo | 10 |
| Familiarity / intuitiveness | 10 |
| Simplicity / cognitive load | 10 |
| State completeness | 10 |
| Accessibility | 10 |
| Craft | 10 |
| Delight / distinctiveness | 5 |

**100 баллов.**

Gate:

**< 90 → этап не проходит.**

Причём нельзя компенсировать плохой UX красивой типографикой:

**ни одна критичная категория не может быть ниже 8/10.**

Для финального interface — ориентир **93+**.

Но score не является абсолютной истиной. Его задача — заставлять агента объяснять, **почему** решение хорошее или плохое.

---

# 11. Design system создаётся до полного Hi‑Fi

С AI это становится ещё важнее.

Агенты без design-system context генерируют generic UI. Когда им доступны реальные components, variables, Code Connect и annotations, они могут переиспользовать существующие паттерны и поддерживать единое визуальное и техническое устройство продукта.

Нельзя после каждого экрана разрешать AI изобретать:

- новый border radius;
- новый button;
- новый shadow;
- новую карточку;
- другой dropdown;
- другой spacing.

Мы даём ему vocabulary.

Например:

```text
Button
Input
SegmentedControl
Chip
Popover
Dropdown
Toast
Modal
Sidebar
NavigationItem
TranscriptRow
SpeakerAvatar
MeetingCard
TopicBlock
ActionItem
StatusIndicator
```

А дальше он **композирует систему**, а не рисует новую систему для каждого экрана.

Для токенов стоит использовать machine-readable формат Design Tokens Community Group.

---

# 12. Специальный AI-context layer

Это, возможно, самый важный технический элемент pipeline.

Не один огромный prompt.

А repository контекста.

Например:

```text
/product-context/
    PRODUCT.md
    USERS.md
    JOBS.md
    DOMAIN.md
    CONSTRAINTS.md

/experience/
    IA.md
    FLOWS.md
    STATE_MATRIX.json
    UX_COPY.md

/data/
    SYNTHETIC_DATASET.json

/design/
    DESIGN.md
    TOKENS.json
    COMPONENTS.md
    MOTION.md
    ACCESSIBILITY.md

/code/
    STACK.md
    COMPONENT_MAPPING.md
    FRONTEND_RULES.md
```

Каждый следующий агент получает этот контекст.

Не приходится каждый раз объяснять продукт заново.

Самое главное — правила становятся **машиночитаемыми**.

Google в 2026 идёт в ту же сторону с `DESIGN.md`: идея состоит в том, чтобы AI понимал не только цвет, но и **зачем** этот цвет используется и какие правила стоят за системой.

---

# 13. State Matrix — обязательный этап

Для условного экрана встречи недостаточно сделать:

> «экран транскрипта».

Нужны:

```text
before meeting
joining
connected
recording
connection lost
reconnecting
processing
ready
empty transcript
1 speaker
8 speakers
unknown speaker
very long transcript
no topics
many topics
permission denied
failed processing
archived
shared
```

Только после этого интерфейс начинает выглядеть как **настоящий продукт**.

Production code часто содержит намного больше реальных states, чем видно в initial design frames, поэтому pipeline должен уметь вытаскивать и сравнивать все реальные состояния, а не только happy path.

---

# 14. Synthetic Data Preparation — отдельный этап

Структура данных становится достаточно определённой после **Domain Model, User Flows и State Architecture**. Поэтому синтетический набор создаётся сразу после этапа 05 и обязательно до любого прототипирования.

Этап создаёт одну согласованную синтетическую реальность продукта, а не независимые случайные примеры для отдельных экранов. Все UX-концепции обязаны использовать этот набор с первого экрана, чтобы сравнивались архитектурные решения, а не разные вымышленные данные.

Для Holdi это означает, что между встречами, проектами, людьми, транскриптами, темами, решениями и задачами сохраняются:

- одни и те же идентификаторы и связи;
- последовательные даты и время;
- правдоподобная история;
- согласованные статусы;
- причинная связь между разговором, выделенной темой, решением и следующим действием;
- соответствие `DOMAIN_MODEL`, `USER_FLOWS` и `STATE_MATRIX`.

Основной результат — машиночитаемый `SYNTHETIC_DATASET.json`, готовый для непосредственного использования при создании всех UX-прототипов, а затем на этапах Hi‑Fi, Code Prototype, тестирования и подготовки UI-assets.

Этот этап не занимается интерфейсом или визуальным стилем и не пытается сразу покрыть все предельные случаи. Его задача — сделать структуру, связи и содержание данных реальными до начала UX Concept Exploration.

---

# 15. Lived-in UI — отдельный этап

Apple удачно формулирует это как **making your app feel lived in**.

Не:

> John Doe  
> Project Name  
> 12:34

а настоящий контекст.

Для Holdi это может быть:

**Алексей Морозов**  
**Weekly продукта**  
Сегодня, 10:03–10:47

> Иван: С тестом нового онбординга тогда идём на 20% пользователей?

**Тема: запуск новой оплаты**

**Следующее действие:**  
Анна пришлёт итоговый прайс до пятницы.

И тогда интерфейс перестаёт выглядеть как Figma template.

Базовый синтетический набор уже создан на этапе 06. Здесь его намеренно расширяют и деформируют, чтобы проверить устойчивость интерфейса:

- реалистичный content;
- длинные тексты;
- большие объёмы данных;
- пустые состояния;
- overflow;
- ошибки;
- нестандартные комбинации данных.

---

# 16. Motion нельзя оставлять генератору «на вкус»

Можно автоматически создавать **tuning interface**.

Например:

```text
Spring stiffness      180
Damping                24
Duration              240 ms
Stagger                36 ms
Blur                    8
Scale                  .985
```

И рядом live prototype.

Агент создаёт tuning panel, а дизайнер в реальном времени настраивает motion parameters, не меняя вручную код в разных местах.

Это позволяет отдельно контролировать:

- timing;
- spring curves;
- delays;
- stagger;
- easing;
- scale;
- opacity;
- blur;
- sequence choreography.

Motion должен объяснять состояние и причинность, а не существовать ради эффекта.

---

# 17. Код должен появляться значительно раньше

Не нужно ждать завершения всего дизайна.

После утверждения UX и базовой design system:

**работаем code-backed.**

Тогда реально проверяются:

- responsive behavior;
- scrolling;
- sticky elements;
- overflow;
- input focus;
- keyboard navigation;
- motion;
- transitions;
- loading;
- real text;
- data density.

Современные AI design tools движутся именно к циклу множество вариантов → интерактивные flows → code → feedback → обратно в canvas.

---

# 18. Production QA — часть дизайнерского pipeline

Не просто:

> код компилируется.

Нужны четыре уровня.

## Functional

Каждый сценарий работает.

## Visual

Screenshot regression.

Нужно хранить эталонные screenshots и автоматически сравнивать новое состояние интерфейса с baseline.

## Component

Каждый component и state существует в Storybook.

Storybook используется для interaction, visual и accessibility tests непосредственно на компонентах.

## System quality

Lighthouse / performance / accessibility.

Quality checks должны работать в CI, чтобы следующие AI-правки не ломали уже утверждённое качество.

---

# 19. Интеграция с landing pipeline

Landing Designer Agent **не должен делать интерфейсы самостоятельно**.

Вместо этого:

```text
LANDING PIPELINE
        │
        │ requests UI
        ▼
INTERFACE PIPELINE
        │
        ├── actual product frontend
        ├── approved states
        ├── screenshots
        ├── cropped components
        ├── animations
        └── interactive embeds
        │
        ▼
UI_ASSET_PACKAGE
        │
        ▼
LANDING PIPELINE
```

То есть лендинг говорит:

> Мне нужен визуал, демонстрирующий автоматическое определение участников.

Но **не рисует его**.

Interface pipeline выбирает реальный approved state:

> `meeting/transcript/speaker-detection`

и отдаёт компонент или screenshot.

---

# 20. Как это должно работать для Holdi

Например, секция лендинга:

**«Разговор становится текстом. С участниками и темами.»**

не должна генерировать декоративный mockup.

Pipeline должен иметь реальный экран:

```text
Meeting Detail
 ├─ transcript
 ├─ timestamps
 ├─ speakers
 ├─ topic segmentation
 ├─ actions
 └─ search
```

заполненный реалистичным разговором.

Landing Art Director лишь решает:

**как его кадрировать, масштабировать, повернуть, анимировать и встроить в storytelling.**

Он **не проектирует сам продукт**.

Это должно радикально повысить качество лендингов.

---

# 21. Итоговая формула pipeline

Не учить AI рисовать красивый UI.

Нужно построить систему, которая заставляет AI:

1. сначала понять продукт;
2. затем подготовить единый синтетический набор данных;
3. затем исследовать десятки решений на одних и тех же данных;
4. затем подвергать их критике;
5. затем формировать design system;
6. затем проверять интерфейс на длинных, пустых, плотных, ошибочных и редких состояниях;
7. затем превращать результат в работающий code-backed prototype;
8. затем проводить UX, accessibility, visual и functional QA;
9. и только после этого доводить до production frontend.

Вокруг неё:

**Orchestrator + 13 specialist agents + independent Critic.**

Это уже не «промпт для дизайна», а **виртуальная product-design команда**.

---

# 22. Изменение общего процесса лендингов

Вместо:

**Prototype → Art Direction → Hi‑Fi → Assets → Landing**

делаем:

**Product definition → Product Interface Pipeline → approved working UI → Landing Prototype → Art Direction → Assets → Hi‑Fi → Production**

То есть **интерфейс продукта становится входным материалом для лендинга**, примерно как логотип, фотографии или иллюстрации.

Это главное исправление относительно того, как был построен процесс Holdi.

---

# 23. Основные исследовательские источники, на которых основан план

- Apple Human Interface Guidelines — Design Principles
- Apple Human Interface Guidelines — Materials / Liquid Glass
- Apple Human Interface Guidelines — Motion
- Apple WWDC26 — design workflows with coding agents, generation, remix, realistic data, tuning, Build/Preview/Test
- Apple WWDC26 — orchestration with sub-agents and accessibility validation
- Figma 2026 AI Report
- Figma materials on design systems + AI + MCP / Code Connect
- Figma workflow materials on bringing real code states back to the canvas
- Nielsen Norman Group — AI prototyping and generic-pattern risks
- Nielsen Norman Group — critique as a key AI-era design competency
- Nielsen Norman Group — compressed, not dead, design process
- Google Labs / Stitch — AI UI design, flows and code generation
- Google DESIGN.md direction for machine-readable design context
- Design Tokens Community Group format
- Storybook interaction / visual / accessibility testing
- Playwright visual regression testing
- Lighthouse CI / performance and accessibility checks
- Lyssna 2026 UX design trend research
- Webflow 2026 web design trends / proprietary visual systems against algorithmic sameness

---

# Ключевой принцип проекта

**UI для лендинга должен быть следствием реального продуктового UX, а не декоративной иллюстрацией интерфейса.**
