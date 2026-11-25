import { render, screen } from '@testing-library/react-native';

import { AppIcon } from '@/components/app-icon';

test('рисует иконку сразу как SVG, без ожидания загрузки шрифта', async () => {
  await render(<AppIcon name="House" size={19} color="#FFFFFF" />);

  expect(screen.toJSON()).toMatchObject({
    type: 'RNSVGSvgView',
    children: expect.any(Array),
  });
  expect(screen.root).toHaveStyle({ width: 19, height: 19 });
});
