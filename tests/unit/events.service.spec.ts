import { Test } from '@nestjs/testing';

import { ConversationsService } from '../../src/modules/conversations/conversations.service';
import { EventsService } from '../../src/modules/events/events.service';

describe('EventsService', () => {
  let svc: EventsService;
  let conversations: jest.Mocked<ConversationsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: ConversationsService,
          useValue: {
            setBotActive: jest.fn(),
            setStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    svc = module.get(EventsService);
    conversations = module.get(ConversationsService);
  });

  describe('handleConversationUpdated', () => {
    it('desativa bot quando hasAssignee=true', async () => {
      await svc.handleConversationUpdated(45, true);
      expect(conversations.setBotActive).toHaveBeenCalledWith(45, false);
    });

    it('nao altera bot quando hasAssignee=false', async () => {
      await svc.handleConversationUpdated(45, false);
      expect(conversations.setBotActive).not.toHaveBeenCalled();
    });
  });

  describe('handleConversationStatusChanged', () => {
    it('ativa bot e atualiza status para open', async () => {
      await svc.handleConversationStatusChanged(45, 'open');
      expect(conversations.setBotActive).toHaveBeenCalledWith(45, true);
      expect(conversations.setStatus).toHaveBeenCalledWith(45, 'open');
    });

    it('apenas atualiza status para resolved', async () => {
      await svc.handleConversationStatusChanged(45, 'resolved');
      expect(conversations.setBotActive).not.toHaveBeenCalled();
      expect(conversations.setStatus).toHaveBeenCalledWith(45, 'resolved');
    });

    it('apenas atualiza status para pending', async () => {
      await svc.handleConversationStatusChanged(45, 'pending');
      expect(conversations.setBotActive).not.toHaveBeenCalled();
      expect(conversations.setStatus).toHaveBeenCalledWith(45, 'pending');
    });
  });
});
