//
//  RNSketchCanvasData.h
//  RNSketchCanvas
//
//  Created by terry on 03/08/2017.
//  Copyright © 2017 Terry. All rights reserved.
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

@interface RNSketchData : NSObject

@property (nonatomic, readonly) NSString* pathId;
@property (nonatomic, readonly) CGFloat strokeWidth;
@property (nonatomic, readonly) UIColor* strokeColor;
@property (nonatomic, readonly) NSArray<NSValue*> *points;
@property (nonatomic, readonly) BOOL isTranslucent;

- (instancetype)initWithId:(NSString*) pathId strokeColor:(UIColor*) strokeColor strokeWidth:(float) strokeWidth points: (NSArray*) points;
- (instancetype)initWithId:(NSString*) pathId strokeColor:(UIColor*) strokeColor strokeWidth:(float) strokeWidth;

- (CGRect)addPoint:(CGPoint) point;

- (void)drawLastPointInContext:(CGContextRef)context;
- (void)drawInContext:(CGContextRef)context;

@end
