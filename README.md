# CHUKO Modern 3D v0.13.16

Исправлены направление разлёта, точность попадания САКА и дальность выбитых чүкө.

## Направление разлёта

Теперь главная ось разлёта строится **от точки удара САКА через центр кучки и дальше**.
Например, если САКА ударила в нижнюю часть кучки, основные чүкө летят через центр в верхнюю половину поля, а не обратно вниз. Выбитые элементы расходятся веером вокруг этой оси.

## Прицел и контакт САКА

- при перетягивании видимая точка прицеливания сразу привязывается к ближайшему реальному чүкө;
- САКА летит именно в ту точку, которую показывает маркер;
- финальная коррекция траектории продолжается почти до физического контакта;
- сценарный разлёт запускается только когда САКА опустилась в узкую контактную зону, поэтому чүкө не должны начинать разлетаться раньше видимого удара.

## Выбитые чүкө

Конечные точки выбитых чүкө перенесены заметно дальше: **за внешний зелёный край ковра**, но с проверкой, чтобы объект оставался в пределах экрана.

## Раскладка

Минимальная дистанция между конечными точками увеличена, чтобы после удара чүкө меньше собирались плотными группами.


## v0.13.16 — visual result validation / green carpet boundary

- Added an explicit `greenRing` calibrated to the outer coloured carpet edge.
- OUT landing points are generated against `greenRing`, with the whole projected chükö footprint required to be outside it.
- IN landing points are prevalidated against the white chalk ring; a small edge overlap remains allowed.
- All landing footprints are checked against the visible screen safe area before the throw.
- After the deterministic scatter finishes, `Выбито` is recomputed from the actual final rendered positions rather than trusting `targetIds/outIds`.
- Final scenario validation remains internal only. A visual mismatch is **never shown to the player** and is not emitted through `X2_GAME_ERROR`; the LMS ticket/scenario/win remains authoritative.
