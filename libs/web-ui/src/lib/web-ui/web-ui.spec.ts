import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebUi } from './web-ui';

describe('WebUi', () => {
  let component: WebUi;
  let fixture: ComponentFixture<WebUi>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebUi],
    }).compileComponents();

    fixture = TestBed.createComponent(WebUi);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
