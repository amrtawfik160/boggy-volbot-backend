import { Test, TestingModule } from '@nestjs/testing';
import { MeController } from '../me.controller';

describe('MeController Integration Tests', () => {
  let controller: MeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
    }).compile();

    controller = module.get<MeController>(MeController);
  });

  describe('getMe', () => {
    it('should return user information from authenticated user', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          role: 'admin',
        },
      };

      const result = controller.getMe(mockUser);

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      });
    });

    it('should default role to "user" when user_metadata is missing', () => {
      const mockUser = {
        id: 'user-456',
        email: 'user@example.com',
      };

      const result = controller.getMe(mockUser);

      expect(result).toEqual({
        id: 'user-456',
        email: 'user@example.com',
        role: 'user',
      });
    });

    it('should default role to "user" when role is not in user_metadata', () => {
      const mockUser = {
        id: 'user-789',
        email: 'another@example.com',
        user_metadata: {},
      };

      const result = controller.getMe(mockUser);

      expect(result).toEqual({
        id: 'user-789',
        email: 'another@example.com',
        role: 'user',
      });
    });

    it('should handle user role correctly', () => {
      const mockUser = {
        id: 'user-101',
        email: 'regular@example.com',
        user_metadata: {
          role: 'user',
        },
      };

      const result = controller.getMe(mockUser);

      expect(result).toEqual({
        id: 'user-101',
        email: 'regular@example.com',
        role: 'user',
      });
    });
  });
});
