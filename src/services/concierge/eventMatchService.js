export class EventMatchService {
  findEventsThatFitFreeBlocks(events, freeBlocks) {
    return events.filter((event) =>
      freeBlocks.some(
        (freeBlock) =>
          new Date(event.startsAt) >= new Date(freeBlock.startsAt) &&
          new Date(event.endsAt) <= new Date(freeBlock.endsAt),
      ),
    );
  }
}
